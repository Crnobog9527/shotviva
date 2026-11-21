import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite, seededRewards } from '../t94-config'

import { bind, commission, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser, ledgerOf } from './helpers'

// Enterprise level 2, card E6 (ARCHITECTURE §6.5): a level-1 customer's own invitees become the
// org's level-2 customers when the org has two levels, and earn the org its l2_bp (5% by default on
// every product kind). Each test runs in a transaction that is rolled back.

let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const setOrg = (orgId: string, input: object) => db.query('select admin_org_update($1,$2,$3)', [actor, orgId, input])
const referral = (user: string) =>
  row(db, 'select referred_by,referred_source,referred_member,referred_via from profiles where id=$1', [user])
const signupGrant = (user: string) => db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])
const redeem = async (user: string, inviter: string, context = 'signup') => {
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  return (await row(db, 'select redeem_code($1,$2,$3,null,$4) as r', [user, code, context, invite.windowDays])).r as
    { status: string; credits_granted: number }
}
async function invitedBy(inviter: string) {
  const customer = await createUser(db)
  await signupGrant(customer)
  return { customer, result: await redeem(customer, inviter) }
}
async function joinOrg(user: string, orgId: string) {
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [user, invite_token])
}

// An org with two levels, a staff member, a level-1 customer A (the staff member's invitee) and A's
// invitee B.
async function chain(levels = 2) {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true, affiliate_levels: levels }
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, input])).id as string
  const staff = await createUser(db)
  await joinOrg(staff, orgId)
  const a = (await invitedBy(staff)).customer
  return { owner, orgId, staff, a }
}

it('binds a level-1 customer\'s invitee as the org\'s level-2 customer; payments earn the org 5% on every kind and refunds claw back', async () => {
  const { owner, staff, a } = await chain()
  const { customer: b, result } = await invitedBy(a)
  expect(result.status).toBe('ok')
  expect(await referral(a)).toEqual({ referred_by: owner, referred_source: 'org_l1', referred_member: staff, referred_via: null })
  expect(await referral(b)).toEqual({ referred_by: owner, referred_source: 'org_l2', referred_member: staff, referred_via: a })

  const pack = await sale(db, b, 'pack_m', 2490)
  expect(await commission(db, pack.id)).toMatchObject({ rate_bp: 500, amount: 124, status: 'pending' })
  expect(await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1', [pack.id])).toEqual({ affiliate_user_id: owner })
  expect(await commission(db, pack.id, 2)).toBeUndefined()
  // Yearly too: the program's default l2_bp for yearly (the personal team bonus) is lower.
  const yearly = await sale(db, b, 'pro_yearly', 47900)
  expect(await commission(db, yearly.id)).toMatchObject({ rate_bp: 500, amount: 2395 })
  // Level 1 keeps its own rates.
  const fromA = await sale(db, a, 'pro_yearly', 47900)
  expect(await commission(db, fromA.id)).toMatchObject({ rate_bp: 1000, amount: 4790 })

  await refund(db, pack.charge, 2490)
  expect(await commission(db, pack.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'refunded' })
})

it('uses the admin\'s level-2 rate for the org once set', async () => {
  const { owner, a } = await chain()
  const { customer: b } = await invitedBy(a)
  await db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: owner, overrides: [{ product_kind: 'pack', l1_bp: null, l2_bp: 800 }] }])
  const p = await sale(db, b, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ rate_bp: 800, amount: 199 })
})

it('stops at two levels: a level-2 customer\'s invitee is not attributed', async () => {
  const { a } = await chain()
  const { customer: b } = await invitedBy(a)
  const { customer: c, result } = await invitedBy(b)
  expect(result.status).toBe('ok')
  expect(await referral(c)).toEqual({ referred_by: null, referred_source: null, referred_member: null, referred_via: null })
})

it('binds no level 2 for a one-level org, or once level 2 is turned off; existing level-2 customers keep earning', async () => {
  const one = await chain(1)
  expect((await referral((await invitedBy(one.a)).customer)).referred_by).toBeNull()

  const { orgId, owner, a } = await chain()
  const { customer: before } = await invitedBy(a)
  await setOrg(orgId, { affiliate_levels: 1 })
  const { customer: after, result } = await invitedBy(a)
  expect(result.status).toBe('ok')
  expect((await referral(after)).referred_by).toBeNull()
  expect((await referral(before)).referred_source).toBe('org_l2')
  const p = await sale(db, before, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ rate_bp: 500, amount: 124, status: 'pending' })
  expect(await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1', [p.id])).toEqual({ affiliate_user_id: owner })
})

it('binds no level 2 while the org is suspended or its affiliate switch is off', async () => {
  const { orgId, a } = await chain()
  await setOrg(orgId, { affiliate_enabled: false })
  expect((await referral((await invitedBy(a)).customer)).referred_by).toBeNull()
  await setOrg(orgId, { affiliate_enabled: true })
  await db.query("update orgs set status='suspended' where id=$1", [orgId])
  expect((await referral((await invitedBy(a)).customer)).referred_by).toBeNull()
})

it('never rebinds an already bound customer, and skips the org\'s own members', async () => {
  const { orgId, a } = await chain()
  const personal = await promoter(db)
  const b = await createUser(db)
  await signupGrant(b)
  // The partner link binds first (signup, or /api/codes/redeem since #780), then the code is redeemed.
  expect(await bind(db, b, personal.slug)).toBe(true)
  expect((await redeem(b, a, 'account')).status).toBe('ok')
  expect(await referral(b)).toMatchObject({ referred_by: personal.id, referred_source: 'signup', referred_member: null, referred_via: null })

  const colleague = await createUser(db)
  await joinOrg(colleague, orgId)
  await signupGrant(colleague)
  await redeem(colleague, a, 'account')
  expect((await referral(colleague)).referred_by).toBeNull()
})

it('voids a level-2 customer\'s commission while they are a member of the same org', async () => {
  const { orgId, a } = await chain()
  const { customer: b } = await invitedBy(a)
  await joinOrg(b, orgId)
  const p = await sale(db, b, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'org_member' })
})

it('lets the redemption succeed and records the error when the level-2 attribution fails', async () => {
  const { a } = await chain()
  await db.query(`create function pg_temp.e6_fail() returns trigger language plpgsql as $$
    begin if new.referred_source='org_l2' then raise exception 'e6 forced failure'; end if; return new; end $$`)
  await db.query('create trigger e6_fail before update on profiles for each row execute function pg_temp.e6_fail()')
  const { customer: b, result } = await invitedBy(a)
  await db.query('drop trigger e6_fail on profiles')
  expect(result).toMatchObject({ status: 'ok', credits_granted: expect.any(Number) })
  expect(await row(db, "select count(*)::int n from code_redemptions where user_id=$1 and status='ok'", [b])).toEqual({ n: 1 })
  expect((await referral(b)).referred_by).toBeNull()
  expect(await row(db, 'select e.error from org_attribution_errors e join code_redemptions r on r.id=e.redemption_id where r.user_id=$1', [b]))
    .toEqual({ error: expect.stringContaining('e6 forced failure') })
})

it('keeps the level-1 customer\'s own invite rewards', async () => {
  const { a } = await chain()
  const { customer: b, result } = await invitedBy(a)
  expect(result.credits_granted).toBe(seededRewards.inviteeCredits)
  const p = await sale(db, b, 'pack_s', 990)
  await db.query('select apply_payment_code_effects($1,$2,null,0,null,$3)', [b, p.id, invite.inviterRewardCap])
  expect(await ledgerOf(db, a)).toContainEqual(expect.objectContaining({ kind: 'invite_reward', delta: seededRewards.inviterCredits }))
})

it('leaves personal affiliates unchanged: their customer\'s invitee is not bound to anyone', async () => {
  const personal = await promoter(db)
  const a = await createUser(db)
  expect(await bind(db, a, personal.slug)).toBe(true)
  const { customer: b } = await invitedBy(a)
  expect((await referral(b)).referred_by).toBeNull()
  const p = await sale(db, a, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ rate_bp: 1500, amount: 373 })
  expect(await row(db, 'select count(*)::int n from affiliate_rate_overrides where user_id=$1', [personal.id])).toEqual({ n: 0 })
})

it('falls back to the org level-2 default, not the personal team bonus, when the org has no level-2 rate', async () => {
  const { owner, a } = await chain()
  const { customer: b } = await invitedBy(a)
  expect(await row(db, 'select count(*)::int n from affiliate_rate_overrides where user_id=$1', [owner])).toEqual({ n: 0 })
  // An admin sets, then clears, the org's yearly level-2 rate (a blank field saves null).
  const yearly = (l2: number | null) => db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: owner, overrides: [{ product_kind: 'yearly', l1_bp: null, l2_bp: l2 }] }])
  await yearly(900)
  expect(await commission(db, (await sale(db, b, 'pro_yearly', 47900)).id)).toMatchObject({ rate_bp: 900 })
  await yearly(null)
  expect(await commission(db, (await sale(db, b, 'pro_yearly', 47900)).id)).toMatchObject({ rate_bp: 500, amount: 2395 })
  // The default lives in one setting.
  await db.query('update affiliate_settings set org_l2_bp=600')
  expect(await commission(db, (await sale(db, b, 'pack_m', 2490)).id)).toMatchObject({ rate_bp: 600, amount: 149 })
})

it('keeps the personal team bonus on the program defaults', async () => {
  await db.query('update affiliate_settings set org_l2_bp=900')
  const parent = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [parent.id])
  const child = await promoter(db, parent.id)
  const buyer = await createUser(db)
  expect(await bind(db, buyer, child.slug)).toBe(true)
  const p = await sale(db, buyer, 'pro_yearly', 47900)
  expect(await commission(db, p.id)).toMatchObject({ rate_bp: 1000, amount: 4790 })
  expect(await commission(db, p.id, 2)).toMatchObject({ rate_bp: 300, amount: 1437 })
})
