import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { bind, commission, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// Enterprise affiliate, card E2 (ARCHITECTURE §6.5): the org account, level-1 attribution through
// staff invite codes, the org rates (l2_bp for org_l2), CNY on enterprise statements, and the
// mutual exclusion with the personal program. Each test runs in a transaction that is rolled back.

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

async function refused(run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

async function createOrg(owner: string, affiliate = true) {
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: affiliate }
  return (await row(db, 'select admin_org_create($1,$2) as id', [actor, input])).id as string
}
async function joinOrg(user: string, orgId: string) {
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [user, invite_token])
}
const setOrg = (orgId: string, input: object) => db.query('select admin_org_update($1,$2,$3)', [actor, orgId, input])
const account = (user: string) => row(db, 'select status,org_id,parent_user_id,team_enabled from affiliates where user_id=$1', [user])
const referral = (user: string) =>
  row(db, 'select referred_by,referred_source,referred_member,referred_via from profiles where id=$1', [user])

const signupGrant = (user: string) => db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])

// A new account that signs up with `inviter`'s personal invite code (T94).
async function invitedBy(inviter: string) {
  const customer = await createUser(db)
  await signupGrant(customer)
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  const result = await row(db, "select redeem_code($1,$2,'signup',null,$3) as r", [customer, code, invite.windowDays])
  return { customer, result: result.r as { status: string; credits_granted: number } }
}

// An org with its affiliate switch on, its owner and one member.
async function orgTeam() {
  const owner = await createUser(db)
  const orgId = await createOrg(owner)
  const staff = await createUser(db)
  await joinOrg(staff, orgId)
  return { owner, orgId, staff }
}

it('creates the owner\'s org account when the switch is on, suspends it when off and restores it', async () => {
  const owner = await createUser(db)
  const orgId = await createOrg(owner, false)
  expect(await account(owner)).toBeUndefined()
  await setOrg(orgId, { affiliate_enabled: true })
  expect(await account(owner)).toEqual({ status: 'active', org_id: orgId, parent_user_id: null, team_enabled: false })
  await setOrg(orgId, { affiliate_enabled: false })
  expect((await account(owner)).status).toBe('suspended')
  await setOrg(orgId, { affiliate_enabled: true })
  expect((await account(owner)).status).toBe('active')

  // An admin's suspension (e.g. risk review) survives turning the switch off and on again.
  await db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: owner, status: 'suspended' }])
  await setOrg(orgId, { affiliate_enabled: false })
  await setOrg(orgId, { affiliate_enabled: true })
  expect((await account(owner)).status).toBe('suspended')
})

it('binds a staff member\'s invitee to the org at level 1; their payment earns the org\'s level-1 rate and refunds claw back', async () => {
  const { owner, staff } = await orgTeam()
  const { customer, result } = await invitedBy(staff)
  expect(result.status).toBe('ok')
  expect(await referral(customer)).toEqual({ referred_by: owner, referred_source: 'org_l1', referred_member: staff, referred_via: null })

  const first = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, first.id)).toMatchObject({ rate_bp: 1500, amount: 373, status: 'pending' })
  expect(await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1', [first.id])).toEqual({ affiliate_user_id: owner })
  expect(await commission(db, first.id, 2)).toBeUndefined()

  // The org's own rate is an override on its account; the owner's invitee counts too.
  await db.query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp) values($1,'pack',2000,700)", [owner])
  const second = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, second.id)).toMatchObject({ rate_bp: 2000, amount: 498 })
  const fromOwner = (await invitedBy(owner)).customer
  expect(await referral(fromOwner)).toMatchObject({ referred_by: owner, referred_member: owner, referred_source: 'org_l1' })

  await refund(db, second.charge, 2490)
  expect(await commission(db, second.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'refunded' })
})

it('pays an org_l2 customer the org\'s l2_bp and leaves every other source on l1_bp', async () => {
  const { owner, staff } = await orgTeam()
  const { customer } = await invitedBy(staff)
  await db.query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp) values($1,'pack',1500,500)", [owner])
  // Level-2 binding is card E6; the commission branch is already in place.
  await db.query("update profiles set referred_source='org_l2',referred_via=$2 where id=$1", [customer, staff])
  const p = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ rate_bp: 500, amount: 124 })
})

it('never rebinds a customer already bound to another account, and skips colleagues in the same org', async () => {
  const { staff, orgId } = await orgTeam()
  const personal = await promoter(db)
  const customer = await createUser(db)
  await signupGrant(customer)
  expect(await bind(db, customer, personal.slug)).toBe(true)
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [staff])
  expect((await row(db, "select redeem_code($1,$2,'account',null,$3) as r", [customer, code, invite.windowDays])).r.status).toBe('ok')
  expect(await referral(customer)).toMatchObject({ referred_by: personal.id, referred_source: 'signup', referred_member: null })

  const colleague = await createUser(db)
  await joinOrg(colleague, orgId)
  await signupGrant(colleague)
  const own = await row(db, 'select get_or_create_invite_code($1) as code', [staff])
  await db.query("select redeem_code($1,$2,'account',null,$3)", [colleague, own.code, invite.windowDays])
  expect((await referral(colleague)).referred_by).toBeNull()
})

it('ignores invites from members of an org whose switch is off', async () => {
  const { orgId, staff } = await orgTeam()
  await setOrg(orgId, { affiliate_enabled: false })
  const { customer, result } = await invitedBy(staff)
  expect(result.status).toBe('ok')
  expect((await referral(customer)).referred_by).toBeNull()
})

it('lets the invite redemption succeed and records the error when the attribution fails', async () => {
  const { staff } = await orgTeam()
  await db.query(`create function pg_temp.e2_fail() returns trigger language plpgsql as $$
    begin if new.referred_source='org_l1' then raise exception 'e2 forced failure'; end if; return new; end $$`)
  await db.query('create trigger e2_fail before update on profiles for each row execute function pg_temp.e2_fail()')
  const { customer, result } = await invitedBy(staff)
  await db.query('drop trigger e2_fail on profiles')
  expect(result).toMatchObject({ status: 'ok', credits_granted: expect.any(Number) })
  expect(await row(db, "select count(*)::int n from code_redemptions where user_id=$1 and status='ok'", [customer])).toEqual({ n: 1 })
  expect((await referral(customer)).referred_by).toBeNull()
  expect(await row(db, 'select e.error from org_attribution_errors e join code_redemptions r on r.id=e.redemption_id where r.user_id=$1', [customer]))
    .toEqual({ error: expect.stringContaining('e2 forced failure') })
})

it('keeps org members out of the personal program', async () => {
  const { owner, staff } = await orgTeam()
  const application = { name: 'A', country: 'US', channel: 'x', audience: '1k', plan: 'p' }
  expect((await row(db, 'select affiliate_can_apply($1) as ok', [staff])).ok).toBe(false)
  await refused(() => db.query("select affiliate_apply($1,$2,null,'1')", [staff, application]), 'AFFILIATE_ORG_MEMBER')
  await refused(() => db.query('select admin_affiliate_create($1,$2)', [actor, { user_id: staff, slug: 'qa-e2-staff' }]), 'AFFILIATE_ORG_MEMBER')
  await refused(() => db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: owner, team_enabled: true }]), 'AFFILIATE_ORG_ACCOUNT')

  // A closed personal account of a member cannot be reopened while they are in the org.
  const former = await promoter(db)
  await db.query("update affiliates set status='suspended' where user_id=$1", [former.id])
  await joinOrg(former.id, (await account(owner)).org_id)
  await refused(() => db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: former.id, status: 'active' }]), 'AFFILIATE_ORG_MEMBER')
})

it('keeps open personal affiliates out of orgs and converts a closed, settled one into the org account', async () => {
  const open = await promoter(db)
  await refused(() => createOrg(open.id), 'ORG_PERSONAL_AFFILIATE')
  const { orgId } = await orgTeam()
  await refused(() => joinOrg(open.id, orgId), 'ORG_PERSONAL_AFFILIATE')

  const owed = await promoter(db)
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,500,'fixture')", [owed.id])
  await db.query("update affiliates set status='suspended' where user_id=$1", [owed.id])
  await refused(() => createOrg(owed.id), 'ORG_PERSONAL_AFFILIATE_UNSETTLED')

  const closed = await promoter(db)
  await db.query("update affiliates set status='suspended',team_enabled=true where user_id=$1", [closed.id])
  await db.query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp) values($1,'pack',3000,900)", [closed.id])
  const converted = await createOrg(closed.id)
  expect(await account(closed.id)).toEqual({ status: 'active', org_id: converted, parent_user_id: null, team_enabled: false })
  // A personal special rate never becomes the org's rate: the org starts on the defaults.
  expect(await row(db, 'select count(*)::int n from affiliate_rate_overrides where user_id=$1', [closed.id])).toEqual({ n: 0 })
})

it('requires the day rate and the CNY sent to mark an enterprise statement paid, and refuses them on a personal one', async () => {
  const { owner } = await orgTeam()
  const personal = await promoter(db)
  const issued = async (user: string, day: string) => {
    await db.query("update affiliates set payout_method='bank',payout_details='fixture' where user_id=$1", [user])
    await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,30000,'fixture')", [user])
    // Each period is issued once (affiliate_settlement_runs), so each statement gets its own month.
    await db.query('select affiliate_daily($1)', [day])
    return (await row(db, 'select id from affiliate_payouts where affiliate_user_id=$1 order by id desc limit 1', [user])).id as string
  }
  const paid = (id: string, extra: object = {}) => db.query('select admin_affiliate_payout_decide($1,$2)', [actor,
    { payout_id: id, status: 'paid', method: 'bank', paid_at: '2031-03-02', paid_reference: 'fixture', expected_amount: 30000, expected_net: 30000, ...extra }])
  await db.query("update affiliate_payout_fee_rules set active=false where program='standard'")

  const org = await issued(owner, '2031-03-01')
  await refused(() => paid(org), 'INVALID_INPUT')
  await refused(() => paid(org, { paid_fx_cny_per_usd: '7.1', paid_amount_cny_fen: 0 }), 'INVALID_INPUT')
  await refused(() => db.query('select admin_affiliate_payout_decide($1,$2)', [actor, { payout_id: org, status: 'held', note: 'x', paid_fx_cny_per_usd: '7.1' }]), 'INVALID_INPUT')
  await paid(org, { paid_fx_cny_per_usd: '7.1234', paid_amount_cny_fen: 213702 })
  expect(await row(db, 'select status,paid_amount::int,paid_fx_cny_per_usd::text fx,paid_amount_cny_fen::int cny from affiliate_payouts where id=$1', [org]))
    .toEqual({ status: 'paid', paid_amount: 30000, fx: '7.123400', cny: 213702 })

  const own = await issued(personal.id, '2031-04-01')
  await refused(() => paid(own, { paid_fx_cny_per_usd: '7.1', paid_amount_cny_fen: 100 }), 'INVALID_INPUT')
  await paid(own)
  expect(await row(db, 'select status,paid_fx_cny_per_usd,paid_amount_cny_fen from affiliate_payouts where id=$1', [own]))
    .toEqual({ status: 'paid', paid_fx_cny_per_usd: null, paid_amount_cny_fen: null })
})

it('clears the org member and level-1 customer when an admin rebinds the customer', async () => {
  const { staff } = await orgTeam()
  const { customer } = await invitedBy(staff)
  const other = await promoter(db)
  await db.query('select admin_affiliate_rebind($1,$2)', [actor, { user_id: customer, affiliate_user_id: other.id, reason: 'fixture' }])
  expect(await referral(customer)).toEqual({ referred_by: other.id, referred_source: 'admin', referred_member: null, referred_via: null })
})

it('voids the commission when the bound customer has since joined the same org', async () => {
  const { owner, orgId, staff } = await orgTeam()
  const { customer } = await invitedBy(staff)
  await joinOrg(customer, orgId)
  const p = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'org_member' })
  expect(await row(db, 'select reason from affiliate_commission_changes h join affiliate_commissions c on c.id=h.commission_id where c.payment_id=$1', [p.id]))
    .toEqual({ reason: 'org_member' })
  await refund(db, p.charge, 1245)
  expect(await commission(db, p.id)).toMatchObject({ amount: 0, void_reason: 'org_member' })
  // Once they leave the org, their next payment earns the org again.
  await db.query("select org_leave($1,'e2-leave-'||gen_random_uuid())", [customer])
  const later = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, later.id)).toMatchObject({ amount: 373, status: 'pending' })
  expect(await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1', [later.id])).toEqual({ affiliate_user_id: owner })
})
