import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { orgCommands, readOrgView } from '@/core/org/console'

import { connectAdmin, serviceClient, setBalances } from './helpers'
import { serviceSupabase } from './supabase-env'
import { account, adminAccount, creditsOf, inviteToken, memberRow, orgLedger, orgWith, poolOf } from './org-fixtures'

// The account centre's enterprise block against the real functions (ARCHITECTURE §6.5, card E4):
// the owner's deposit, link reset, allowances, hand allocations, removal, and a member leaving,
// each through the same commands the server actions call, then read back the way the pages do.

const service = serviceClient()
const supabase = serviceSupabase()
let db: Client
let actor: string

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
})

afterAll(async () => {
  await db.end()
})

const as = (user: string) => ({ db: supabase, user })

describe('owner console commands', () => {
  it('deposits once per form id and only the owner\'s own credits', async () => {
    const { orgId, owner } = await orgWith(db, service, actor, { pool: 100 })
    await setBalances(db, owner, { credits: 400 })
    const form = { requestId: randomUUID(), credits: 150 }
    expect(await orgCommands.deposit(as(owner), form)).toEqual({ ok: true, pool: 250 })
    expect(await orgCommands.deposit(as(owner), form)).toEqual({ ok: true, pool: 250 })
    expect(await creditsOf(db, owner)).toBe(250)
    expect(await poolOf(db, orgId)).toBe(250)
    expect((await orgLedger(db, orgId)).filter((row) => row.kind === 'owner_deposit')).toHaveLength(1)
    expect(await orgCommands.deposit(as(owner), { requestId: randomUUID(), credits: 1000 })).toEqual({ ok: false, error: 'CREDITS_INSUFFICIENT' })
    expect(await orgCommands.deposit(as(owner), { ...form, credits: 99 })).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('refuses everyone but the owner, whatever the form says', async () => {
    const { orgId, token } = await orgWith(db, service, actor, { pool: 100 })
    const staff = await account(db, service)
    expect(await orgCommands.join(as(staff), token)).toEqual({ ok: true })
    const stranger = await account(db, service)
    for (const user of [staff, stranger]) {
      expect(await orgCommands.allocate(as(user), { requestId: randomUUID(), member: staff, credits: 10 })).toEqual({ ok: false, error: 'NOT_OWNER' })
      expect(await orgCommands.setAllowance(as(user), { member: staff, allowance: 10 })).toEqual({ ok: false, error: 'NOT_OWNER' })
      expect(await orgCommands.removeMember(as(user), { requestId: randomUUID(), member: staff })).toEqual({ ok: false, error: 'NOT_OWNER' })
      expect(await orgCommands.resetInvite(as(user))).toEqual({ ok: false, error: 'NOT_OWNER' })
    }
    expect(await poolOf(db, orgId)).toBe(100)
    expect((await memberRow(db, orgId, staff))?.status).toBe('active')
  })

  it('resets the invite link: the old one stops working, members stay, a suspended org may still reset', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor)
    const staff = await account(db, service)
    expect(await orgCommands.join(as(staff), token)).toEqual({ ok: true })
    const reset = await orgCommands.resetInvite(as(owner))
    expect(reset).toMatchObject({ ok: true, token: expect.stringMatching(/^[0-9a-f]{32}$/) })
    if (!reset.ok) return
    expect(reset.token).not.toBe(token)
    expect(await inviteToken(db, orgId)).toBe(reset.token)
    expect(await orgCommands.join(as(await account(db, service)), token)).toEqual({ ok: false, error: 'INVITE_INVALID' })
    expect(await orgCommands.join(as(await account(db, service)), reset.token)).toEqual({ ok: true })
    expect((await memberRow(db, orgId, staff))?.status).toBe('active')
    await db.query("update public.orgs set status = 'suspended' where id = $1", [orgId])
    expect(await orgCommands.resetInvite(as(owner))).toMatchObject({ ok: true })
    expect(await orgCommands.join(as(await account(db, service)), await inviteToken(db, orgId))).toEqual({ ok: false, error: 'SUSPENDED' })
  })
})

describe('members through the console', () => {
  it('gives a member credits and shows both sides the same numbers, then reclaims on leave', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 1000 })
    const staff = await account(db, service)
    expect(await orgCommands.join(as(staff), token)).toEqual({ ok: true })
    expect(await orgCommands.setAllowance(as(owner), { member: staff, allowance: 300 })).toEqual({ ok: true, allowance: 300 })
    const give = { requestId: randomUUID(), member: staff, credits: 250 }
    expect(await orgCommands.allocate(as(owner), give)).toEqual({ ok: true, pool: 750 })
    expect(await orgCommands.allocate(as(owner), give)).toEqual({ ok: true, pool: 750 })
    expect(await orgCommands.allocate(as(owner), { requestId: randomUUID(), member: staff, credits: 5000 })).toEqual({ ok: false, error: 'POOL_INSUFFICIENT' })

    const ownerView = await readOrgView(owner, { db: supabase })
    expect(ownerView).toMatchObject({ kind: 'owner', org: { poolCredits: 750 } })
    if (ownerView.kind === 'owner') {
      expect(ownerView.members.find((m) => m.userId === staff)).toMatchObject({ monthlyAllowance: 300, heldCredits: 250, role: 'member' })
    }
    expect(await readOrgView(staff, { db: supabase })).toMatchObject({ kind: 'member', monthlyAllowance: 300, allocatedThisMonth: 250, heldCredits: 250 })

    // The member spends 100 (the org's credits are spent first), so leaving gives back the 150 left.
    await db.query('update public.profiles set credits = credits - 100 where id = $1', [staff])
    expect(await orgCommands.leave(as(staff), { requestId: randomUUID() })).toEqual({ ok: true, reclaimed: 150 })
    expect(await poolOf(db, orgId)).toBe(900)
    expect(await readOrgView(staff, { db: supabase })).toEqual({ kind: 'none' })
  })

  it('removes a member once per form id and gives their unspent credits back', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: 500 })
    const staff = await account(db, service)
    await orgCommands.join(as(staff), token)
    await orgCommands.allocate(as(owner), { requestId: randomUUID(), member: staff, credits: 200 })
    const form = { requestId: randomUUID(), member: staff }
    expect(await orgCommands.removeMember(as(owner), form)).toEqual({ ok: true, reclaimed: 200 })
    expect(await orgCommands.removeMember(as(owner), form)).toEqual({ ok: true, reclaimed: 0 })
    expect(await poolOf(db, orgId)).toBe(500)
    expect(await creditsOf(db, staff)).toBe(0)
    expect(await orgCommands.removeMember(as(owner), { requestId: randomUUID(), member: owner })).toEqual({ ok: false, error: 'OWNER_CANNOT_LEAVE' })
  })

  it('answers the join page\'s error cases', async () => {
    const first = await orgWith(db, service, actor)
    const second = await orgWith(db, service, actor)
    const staff = await account(db, service)
    expect(await orgCommands.join(as(staff), first.token)).toEqual({ ok: true })
    expect(await orgCommands.join(as(staff), first.token)).toEqual({ ok: true })
    expect(await orgCommands.join(as(staff), second.token)).toEqual({ ok: false, error: 'ALREADY_IN_ORG' })
    expect(await orgCommands.join(as(await account(db, service)), 'f'.repeat(32))).toEqual({ ok: false, error: 'INVITE_INVALID' })
    expect(await orgCommands.leave(as(first.owner), { requestId: randomUUID() })).toEqual({ ok: false, error: 'OWNER_CANNOT_LEAVE' })
  })
})
