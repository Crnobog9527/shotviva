import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readSignupGift } from '@/core/auth'
import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { recordSignupIp } from '@/core/auth/signup-ip'
import { claimSignupGift } from '@/core/auth/signup-gift-claim'
import { markStaffSignup } from '@/core/auth/staff-signup'
import { assertNotOrgMember } from '@/core/billing/org-member-guard'
import { staffNewUserCode } from '@/core/codes/staff-guard'
import { adminUpdateOrg, joinOrg, leaveOrg, removeOrgMember } from '@/core/org'
import { site } from '@/site/site.config'

import { invite } from '../t94-config'

import { connectAdmin, createUser, serviceClient } from './helpers'
import { account, adminAccount, member, orgWith } from './org-fixtures'
import { serviceSupabase } from './supabase-env'

// 1940 (ARCHITECTURE §6.5 员工账号): a staff-link signup stores the refusal 'staff', and no later
// sign-in, claim or removal from the org pays the signup gift (Owner 2026-11-22).

let db: Client
const service = serviceSupabase()
const rest = serviceClient()
const FREE = site.billing.freeCredits
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

const refusal = async (id: string) =>
  (await db.query<{ r: string | null }>('select signup_gift_refusal as r from public.profiles where id = $1', [id])).rows[0]?.r
const signupRows = async (id: string) =>
  Number((await db.query<{ n: string }>('select count(*) as n from public.credit_ledger where idempotency_key = $1', [`signup:${id}`])).rows[0]!.n)

it('never pays the gift to a marked staff account: not on a later sign-in, not by a claim', async () => {
  const id = await createUser(db)
  await recordSignupIp(service, id, '198.51.100.40')
  await markStaffSignup(service, id)
  expect(await refusal(id)).toBe('staff')
  // A later ordinary sign-in retries the gift: the stored refusal stands.
  expect(await grantSignupCredits(billingGrant(service), id, FREE)).toBe(false)
  expect(['not_pending', 'method_off', 'no_identity']).toContain(await claimSignupGift(service, id, null))
  expect(await signupRows(id)).toBe(0)
  expect(await readSignupGift(service, id, FREE)).toEqual({ granted: 0, refused: true, reason: 'staff' })
})

it('leaves a gift already paid alone', async () => {
  const id = await createUser(db)
  expect(await grantSignupCredits(billingGrant(service), id, FREE)).toBe(true)
  const { data } = await service.rpc('mark_staff_signup', { p_user_id: id })
  expect(data).toBe(false)
  expect(await refusal(id)).toBeNull()
  expect(await signupRows(id)).toBe(1)
})

it('is callable by the service role only', async () => {
  const { rows } = await db.query(`select r as role, has_function_privilege(r, 'public.mark_staff_signup(uuid)', 'execute') as can
    from unnest(array['anon','authenticated','service_role']) r order by r`)
  expect(rows).toEqual([{ role: 'anon', can: false }, { role: 'authenticated', can: false }, { role: 'service_role', can: true }])
})

// Codex P1 (#841), 1950: an existing account whose gift is pending under the per-network
// allowance keeps that claim when it signs in through a staff link.
it('never turns another stored refusal into staff', async () => {
  const id = await createUser(db)
  await db.query("update public.profiles set signup_gift_refusal = 'same_ip_pending' where id = $1", [id])
  expect(await markStaffSignup(service, id)).toBe(false)
  expect(await refusal(id)).toBe('same_ip_pending')
  // An account older than 24 hours that already signed in (signup IP stored) is not a staff
  // sign-up when it later signs in through a staff link.
  const older = await createUser(db)
  await db.query("update public.profiles set created_at = now() - interval '2 days', signup_ip = '198.51.100.41' where id = $1", [older])
  expect(await markStaffSignup(service, older)).toBe(false)
  expect(await refusal(older)).toBeNull()
  // A sign-up confirmed more than 24 hours late is still on its first verified sign-in (no IP yet).
  const late = await createUser(db)
  await db.query("update public.profiles set created_at = now() - interval '2 days' where id = $1", [late])
  expect(await markStaffSignup(service, late)).toBe(true)
  // A second mark of a staff account still answers marked.
  const staff = await createUser(db)
  expect(await markStaffSignup(service, staff)).toBe(true)
  expect(await markStaffSignup(service, staff)).toBe(true)
})

describe('customer link sign-up', () => {
  it('is unchanged: the signup gift, the staff invite code reward and the org binding as before', async () => {
    // The program switch is shared with other suites: on for this test only, then back.
    const { rows: [before] } = await db.query<{ enabled: boolean }>('select enabled from public.affiliate_settings limit 1')
    await db.query('update public.affiliate_settings set enabled = true')
    try {
      await customerSignup()
    } finally {
      await db.query('update public.affiliate_settings set enabled = $1', [before?.enabled ?? false])
    }
  })
})

async function customerSignup() {
    const actor = await adminAccount(db, rest)
    const { token } = await orgWith(db, rest, actor, { usage: { affiliate_enabled: true } })
    const staff = await member(db, rest, token)
    const customer = await createUser(db)
    expect(await grantSignupCredits(billingGrant(service), customer, FREE)).toBe(true)
    const { rows: [{ code }] } = await db.query<{ code: string }>('select public.get_or_create_invite_code($1) as code', [staff])
    const { rows: [{ r }] } = await db.query<{ r: { status: string } }>("select public.redeem_code($1, $2, 'signup', null, $3) as r", [customer, code, invite.windowDays])
    expect(r.status).toBe('ok')
    expect(await refusal(customer)).toBeNull()
    expect(await signupRows(customer)).toBe(1)
    expect((await db.query('select referred_source from public.profiles where id = $1', [customer])).rows[0]).toEqual({ referred_source: 'org_l1' })
    await expect(assertNotOrgMember(service, customer)).resolves.toBeUndefined()
}

describe('personal checkout while an org member', () => {
  it('is refused for an active staff member, never for the owner, allowed after removal, refused again on rejoining', async () => {
    const actor = await adminAccount(db, rest)
    const { owner, token } = await orgWith(db, rest, actor)
    const staff = await account(db, rest)
    await expect(assertNotOrgMember(service, staff)).resolves.toBeUndefined()
    await joinOrg(rest, staff, token)
    await expect(assertNotOrgMember(service, staff)).rejects.toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
    // The primary admin tops up the org by buying: never refused (Owner 2026-11-22).
    await expect(assertNotOrgMember(service, owner)).resolves.toBeUndefined()

    await removeOrgMember(rest, owner, staff, `rm:${randomUUID()}`)
    await expect(assertNotOrgMember(service, staff)).resolves.toBeUndefined()
    await joinOrg(rest, staff, token)
    await expect(assertNotOrgMember(service, staff)).rejects.toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
    await leaveOrg(rest, staff, `leave:${randomUUID()}`)
    await expect(assertNotOrgMember(service, staff)).resolves.toBeUndefined()
  })

  // Owner 2026-11-23: a member of a suspended org buys again; reactivated, it is refused again.
  it('allows a member of a suspended org, refuses it again once the org is active', async () => {
    const actor = await adminAccount(db, rest)
    const { orgId, token } = await orgWith(db, rest, actor)
    const staff = await member(db, rest, token)
    await expect(assertNotOrgMember(service, staff)).rejects.toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
    await adminUpdateOrg(rest, actor, orgId, { status: 'suspended' })
    await expect(assertNotOrgMember(service, staff)).resolves.toBeUndefined()
    await adminUpdateOrg(rest, actor, orgId, { status: 'active' })
    await expect(assertNotOrgMember(service, staff)).rejects.toMatchObject({ code: 'ORG_MEMBER_CHECKOUT' })
  })
})

// Follow-up of #841: a staff-link sign-up gets no new-user code reward, also after leaving.
describe('new-user codes for a staff-link sign-up', () => {
  it('are refused (invite codes here; new_users_only campaign codes use the same lookup)', async () => {
    const inviter = await createUser(db)
    const { rows: [{ code }] } = await db.query<{ code: string }>('select public.get_or_create_invite_code($1) as code', [inviter])
    const staff = await createUser(db)
    expect(await markStaffSignup(service, staff)).toBe(true)
    expect(await staffNewUserCode(service, staff, code)).toBe(true)
    const other = await createUser(db)
    expect(await staffNewUserCode(service, other, code)).toBe(false)
  })
})
