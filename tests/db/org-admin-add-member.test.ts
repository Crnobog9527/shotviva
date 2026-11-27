import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { effectiveLimits } from '@/core/billing'
import { adminAddOrgMember, adminUpdateOrg, leaveOrg, removeOrgMember } from '@/core/org'

import { anonClient, connectAdmin, serviceClient } from './helpers'
import { account, adminAccount, memberRow, orgWith } from './org-fixtures'

// admin_org_add_member (1800, ARCHITECTURE §6.5): an admin adds an existing account to an org
// without the invite link. Same rules as org_join, idempotent for this org, audited, service role
// only. Fake accounts only; nothing here creates a user for an employee.

const service = serviceClient()
let db: Client
let actor: string

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
})
afterAll(async () => { await db.end() })

const add = (orgId: string, userId: string, as = actor) => adminAddOrgMember(service, as, orgId, userId)
const rejected = (work: Promise<unknown>, message: string) => expect(work).rejects.toMatchObject({ message })
const audits = async (orgId: string, userId: string) =>
  (await db.query("select user_id, reason from public.admin_audit_log where action = 'org_add_member' and target_id = $1 and reason = $2", [orgId, `member:${userId}`])).rows

describe('adding a member', () => {
  it('makes an unbanned account without an org a member, audited once, and a repeat does nothing', async () => {
    const { orgId } = await orgWith(db, service, actor, { usage: { concurrency: 5 } })
    const user = await account(db, service)
    expect(await add(orgId, user)).toEqual({ applied: true })
    expect(await memberRow(db, orgId, user)).toEqual({ held_credits: 0, status: 'active', monthly_allowance: 0 })
    expect((await db.query('select role from public.org_members where org_id = $1 and user_id = $2', [orgId, user])).rows[0]).toEqual({ role: 'member' })
    expect(await audits(orgId, user)).toEqual([{ user_id: actor, reason: `member:${user}` }])
    // The org's usage lift applies like for any member.
    expect(await effectiveLimits(service, user)).toMatchObject({ orgId, concurrency: 5 })

    expect(await add(orgId, user)).toEqual({ applied: false })
    expect(await audits(orgId, user)).toHaveLength(1)
  })

  it('brings a removed member back with a clean slate', async () => {
    const { orgId, owner } = await orgWith(db, service, actor)
    const user = await account(db, service)
    await add(orgId, user)
    await db.query('update public.org_members set monthly_allowance = 50, held_credits = 7 where org_id = $1 and user_id = $2', [orgId, user])
    await removeOrgMember(service, owner, user, `rm:${randomUUID()}`)
    expect((await memberRow(db, orgId, user))?.status).toBe('removed')
    expect(await add(orgId, user)).toEqual({ applied: true })
    expect(await memberRow(db, orgId, user)).toEqual({ held_credits: 0, status: 'active', monthly_allowance: 0 })
    await leaveOrg(service, user, `leave:${randomUUID()}`)
    expect(await add(orgId, user)).toEqual({ applied: true })
  })

  it('turns a customer referred to the org into a member the program no longer treats as a customer', async () => {
    const { orgId } = await orgWith(db, service, actor)
    const user = await account(db, service)
    await add(orgId, user)
    // Joining by an admin counts as membership everywhere org_join's does (affiliate exclusion, 1642).
    const { rows } = await db.query('select public._org_active_member($1) as member, public.affiliate_can_apply($1) as can_apply', [user])
    expect(rows[0]).toEqual({ member: true, can_apply: false })
  })
})

describe('the rules of org_join', () => {
  it('refuses a non-admin, a banned admin and a missing actor', async () => {
    const { orgId } = await orgWith(db, service, actor)
    const user = await account(db, service)
    const plain = await account(db, service)
    await rejected(add(orgId, user, plain), 'NOT_ADMIN')
    const banned = await adminAccount(db, service)
    await db.query('update public.profiles set banned_at = now() where id = $1', [banned])
    await rejected(add(orgId, user, banned), 'NOT_ADMIN')
    const { error } = await service.rpc('admin_org_add_member', { p_actor: null, p_input: { org_id: orgId, user_id: user } })
    expect(error?.message).toBe('NOT_ADMIN')
    expect(await memberRow(db, orgId, user)).toBeUndefined()
  })

  it('refuses malformed input, an unknown org and an unknown account', async () => {
    const { orgId } = await orgWith(db, service, actor)
    const user = await account(db, service)
    for (const input of [null, {}, { org_id: orgId }, { user_id: user }, { org_id: 'x', user_id: user }, { org_id: orgId, user_id: 'a@b.co' }, []]) {
      const { error } = await service.rpc('admin_org_add_member', { p_actor: actor, p_input: input })
      expect(error?.message).toBe('INVALID_INPUT')
    }
    await rejected(add(randomUUID(), user), 'ORG_NOT_FOUND')
    await rejected(add(orgId, randomUUID()), 'PROFILE_NOT_FOUND')
  })

  it('refuses a suspended org and a banned account', async () => {
    const { orgId } = await orgWith(db, service, actor)
    const user = await account(db, service)
    const banned = await account(db, service)
    await db.query('update public.profiles set banned_at = now() where id = $1', [banned])
    await rejected(add(orgId, banned), 'USER_BANNED')
    await adminUpdateOrg(service, actor, orgId, { status: 'suspended' })
    await rejected(add(orgId, user), 'ORG_SUSPENDED')
    expect(await memberRow(db, orgId, user)).toBeUndefined()
    expect(await memberRow(db, orgId, banned)).toBeUndefined()
  })

  it('refuses an account that is a member or the owner of another org, and keeps it there', async () => {
    const first = await orgWith(db, service, actor)
    const second = await orgWith(db, service, actor)
    const user = await account(db, service)
    await add(first.orgId, user)
    await rejected(add(second.orgId, user), 'ORG_MEMBER_EXISTS')
    await rejected(add(second.orgId, first.owner), 'ORG_MEMBER_EXISTS')
    expect((await memberRow(db, first.orgId, user))?.status).toBe('active')
    expect(await memberRow(db, second.orgId, user)).toBeUndefined()
  })

  it('refuses an open personal affiliate account but not a closed one', async () => {
    const { orgId } = await orgWith(db, service, actor)
    for (const status of ['pending', 'active']) {
      const user = await account(db, service)
      await db.query('insert into public.affiliates(user_id, slug, status) values ($1, $2, $3)', [user, `sv-${randomUUID().slice(0, 12)}`, status])
      await rejected(add(orgId, user), 'ORG_PERSONAL_AFFILIATE')
      expect(await memberRow(db, orgId, user)).toBeUndefined()
    }
    for (const status of ['rejected', 'suspended']) {
      const user = await account(db, service)
      await db.query('insert into public.affiliates(user_id, slug, status) values ($1, $2, $3)', [user, `sv-${randomUUID().slice(0, 12)}`, status])
      expect(await add(orgId, user)).toEqual({ applied: true })
    }
  })

  it('lets only one of two simultaneous adds of the same account into two orgs win', async () => {
    const first = await orgWith(db, service, actor)
    const second = await orgWith(db, service, actor)
    const user = await account(db, service)
    const results = await Promise.allSettled([add(first.orgId, user), add(second.orgId, user)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    const { rows } = await db.query('select count(*)::int as n from public.org_members where user_id = $1 and status = $2', [user, 'active'])
    expect(rows[0]).toEqual({ n: 1 })
  })
})

describe('privileges', () => {
  it('is callable by the service role only', async () => {
    for (const [role, allowed] of [['anon', false], ['authenticated', false], ['public', false], ['service_role', true]] as const) {
      const sql = role === 'public'
        ? "select exists(select 1 from information_schema.routine_privileges where routine_name = 'admin_org_add_member' and grantee = 'PUBLIC') as ok"
        : "select has_function_privilege($1, 'public.admin_org_add_member(uuid, jsonb)', 'execute') as ok"
      const { rows } = await db.query(sql, role === 'public' ? [] : [role])
      expect(rows[0].ok).toBe(allowed)
    }
  })

  it('answers a client with permission denied, member row untouched', async () => {
    const { orgId } = await orgWith(db, service, actor)
    const user = await account(db, service)
    const { error } = await anonClient().rpc('admin_org_add_member', { p_actor: actor, p_input: { org_id: orgId, user_id: user } })
    expect(error).not.toBeNull()
    expect(await memberRow(db, orgId, user)).toBeUndefined()
  })
})
