import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { bind, promoter, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// Enterprise signup bonus (1690, ARCHITECTURE §6.5): extra free credits, set per org by a platform
// admin, for a new user bound as the org's level-1 customer through a staff invite. On top of the
// normal invitee reward, once per user, at the amount set when they are bound. Each test runs in
// a transaction that is rolled back. Fake data only.

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

// As text: a JS Date drops the microseconds and the stale-form check would refuse it.
const updatedAt = async (orgId: string) => (await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])).at as string
async function setBonus(orgId: string, credits: number) {
  return (await row(db, 'select admin_org_set_signup_bonus($1,$2,$3,$4)::text as at', [actor, orgId, credits, await updatedAt(orgId)])).at as string
}
const setOrg = (orgId: string, input: object) => db.query('select admin_org_update($1,$2,$3)', [actor, orgId, input])

async function orgTeam(bonus: number) {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  await db.query('select org_join($1,$2)', [staff, invite_token])
  if (bonus) await setBonus(orgId, bonus)
  return { owner, orgId, staff }
}

// A new account that redeems `inviter`'s personal invite code at signup (or later from the
// account page when `context` is 'account', which 2030 refuses).
async function invitedBy(inviter: string, opts: { context?: 'signup' | 'account'; customer?: string } = {}) {
  const customer = opts.customer ?? await createUser(db)
  if (!opts.customer) await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  const result = (await row(db, 'select redeem_code($1,$2,$3,null,$4) as r', [customer, code, opts.context ?? 'signup', invite.windowDays])).r
  return { customer, result: result as { status: string; credits_granted: number; reason?: string } }
}

const bonusLedger = (user: string) =>
  db.query("select delta,pool,idempotency_key from credit_ledger where user_id=$1 and kind='org_signup_bonus'", [user]).then((r) => r.rows)
const freeCredits = async (user: string) => (await row(db, 'select free_credits from profiles where id=$1', [user])).free_credits as number
const bonusRow = (user: string) => row(db, 'select org_id,member_user_id,credits from org_signup_bonuses where user_id=$1', [user])

it('gives a staff member\'s new invitee the org\'s bonus once, in the free pool, instead of the personal invite reward (2032)', async () => {
  const { orgId, staff } = await orgTeam(300)
  const { customer, result } = await invitedBy(staff)
  expect(result.status).toBe('ok')
  expect(await bonusLedger(customer)).toEqual([{ delta: 300, pool: 'free', idempotency_key: 'org_signup_bonus:' + customer }])
  expect(await freeCredits(customer)).toBe(6 + result.credits_granted + 300)
  expect(await bonusRow(customer)).toEqual({ org_id: orgId, member_user_id: staff, credits: 300 })
  // 2032: no personal invitee reward for a staff code.
  expect(result.credits_granted).toBe(0)
  expect(await row(db, "select count(*)::int n from credit_ledger where user_id=$1 and kind='code_grant'", [customer])).toEqual({ n: 0 })

  // Nothing re-fires it: another profile update, a rebind and back, or a replayed binding.
  await db.query('update profiles set free_credits=free_credits where id=$1', [customer])
  await db.query("update profiles set referred_by=null,referred_source=null,referred_member=null where id=$1", [customer])
  await db.query("update profiles set referred_by=(select owner_user_id from orgs where id=$2),referred_source='org_l1',referred_member=$3 where id=$1", [customer, orgId, staff])
  expect(await bonusLedger(customer)).toHaveLength(1)
  expect(await freeCredits(customer)).toBe(6 + result.credits_granted + 300)
})

it('uses the amount set when the user is bound; later changes leave earlier users alone; 0 turns it off', async () => {
  const { orgId, staff, owner } = await orgTeam(300)
  const first = (await invitedBy(staff)).customer
  await setBonus(orgId, 500)
  const second = (await invitedBy(owner)).customer
  await setBonus(orgId, 0)
  const third = (await invitedBy(staff)).customer
  expect((await bonusLedger(first))[0].delta).toBe(300)
  expect((await bonusLedger(second))[0].delta).toBe(500)
  expect(await bonusLedger(third)).toEqual([])
  expect(await row(db, 'select count(*)::int n from org_signup_bonuses where org_id=$1', [orgId])).toEqual({ n: 2 })
})

it('gives each org its own amount', async () => {
  const a = await orgTeam(300)
  const b = await orgTeam(500)
  expect((await bonusLedger((await invitedBy(a.staff)).customer))[0].delta).toBe(300)
  expect((await bonusLedger((await invitedBy(b.staff)).customer))[0].delta).toBe(500)
})

// 2035 (Owner 2026-11-28, A2): the bonus follows the affiliate switch, not the workspace switch.
it('gives nothing while its affiliate switch is off or its account is suspended, and still gives it with the workspace off', async () => {
  const { orgId, staff, owner } = await orgTeam(300)
  await setOrg(orgId, { status: 'suspended' })
  expect(await bonusLedger((await invitedBy(staff)).customer)).toHaveLength(1)
  await setOrg(orgId, { status: 'active', affiliate_enabled: false })
  expect(await bonusLedger((await invitedBy(staff)).customer)).toEqual([])
  await setOrg(orgId, { affiliate_enabled: true })
  await db.query("update affiliates set status='suspended' where user_id=$1", [owner])
  expect(await bonusLedger((await invitedBy(staff)).customer)).toEqual([])
  await db.query("update affiliates set status='active' where user_id=$1", [owner])
  expect(await bonusLedger((await invitedBy(staff)).customer)).toHaveLength(1)
})

it('gives no late redemption at all: an invite code after sign-up is refused even inside 7 days (2030)', async () => {
  const { staff } = await orgTeam(300)
  const late = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [late, 'signup:' + late])
  await db.query("update profiles set created_at=now()-interval '3 days' where id=$1", [late])
  expect((await invitedBy(staff, { customer: late, context: 'account' })).result).toMatchObject({ status: 'new_users_only', reason: 'signup_only' })
  expect(await bonusLedger(late)).toEqual([])
  expect((await row(db, 'select referred_by from profiles where id=$1', [late])).referred_by).toBeNull()

  const payer = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [payer, 'signup:' + payer])
  await sale(db, payer, 'pack_m', 2490)
  expect((await invitedBy(staff, { customer: payer, context: 'account' })).result.status).toBe('new_users_only')
  expect(await bonusLedger(payer)).toEqual([])
})

it('keeps the invite anti-abuse rules: an invite without the gift and a second invite give no bonus', async () => {
  const { staff } = await orgTeam(300)
  // A staff code on the customer's network is no longer refused (2025); a missing gift still is.
  const sameIp = await createUser(db)
  await db.query("update profiles set signup_ip='203.0.113.9' where id in ($1,$2)", [staff, sameIp])
  expect((await invitedBy(staff, { customer: sameIp })).result.status).toBe('blocked_no_signup_grant')
  expect(await bonusLedger(sameIp)).toEqual([])

  const twice = (await invitedBy(staff)).customer
  const other = await orgTeam(500)
  expect((await invitedBy(other.staff, { customer: twice })).result.status).toBe('already_invited')
  expect(await bonusLedger(twice)).toHaveLength(1)
  expect((await bonusLedger(twice))[0].delta).toBe(300)
})

it('gives nothing to a level-2 customer bound by the real E6 path (a level-1 customer\'s invitee)', async () => {
  const { orgId, staff, owner } = await orgTeam(300)
  await setOrg(orgId, { affiliate_levels: 2 })
  const first = (await invitedBy(staff)).customer
  const second = (await invitedBy(first)).customer
  expect(await row(db, 'select referred_by,referred_source,referred_via from profiles where id=$1', [second]))
    .toEqual({ referred_by: owner, referred_source: 'org_l2', referred_via: first })
  expect((await bonusLedger(first))[0].delta).toBe(300)
  expect(await bonusLedger(second)).toEqual([])
})

it('gives nothing to a level-2 binding, a personal affiliate\'s customer or a plain personal invite', async () => {
  const { orgId, staff, owner } = await orgTeam(300)
  // Level 2 (card E6) binds org_l2: no bonus, whoever writes it.
  const l2 = await createUser(db)
  await db.query("update profiles set referred_by=$2,referred_source='org_l2',referred_via=$3 where id=$1", [l2, owner, staff])
  expect(await bonusLedger(l2)).toEqual([])

  const personal = await promoter(db)
  const customer = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
  expect(await bind(db, customer, personal.slug)).toBe(true)
  expect(await bonusLedger(customer)).toEqual([])
  // Already bound to a personal affiliate: the staff invite still pays its normal reward, no bonus.
  expect((await invitedBy(staff, { customer })).result.status).toBe('ok')
  expect(await bonusLedger(customer)).toEqual([])

  const friend = await createUser(db)
  const plain = await invitedBy(friend)
  expect(plain.result.status).toBe('ok')
  expect(await bonusLedger(plain.customer)).toEqual([])
  expect(await row(db, 'select count(*)::int n from org_signup_bonuses where org_id=$1', [orgId])).toEqual({ n: 0 })
})

it('lets the redemption and the binding succeed and records the error when the grant fails', async () => {
  const { owner, staff } = await orgTeam(300)
  await db.query(`create function pg_temp.bonus_fail() returns trigger language plpgsql as $$
    begin if new.kind='org_signup_bonus' then raise exception 'bonus forced failure'; end if; return new; end $$`)
  await db.query('create trigger bonus_fail before insert on credit_ledger for each row execute function pg_temp.bonus_fail()')
  const { customer, result } = await invitedBy(staff)
  await db.query('drop trigger bonus_fail on credit_ledger')
  expect(result).toMatchObject({ status: 'ok', credits_granted: expect.any(Number) })
  expect(await row(db, 'select referred_by,referred_source from profiles where id=$1', [customer])).toEqual({ referred_by: owner, referred_source: 'org_l1' })
  expect(await bonusLedger(customer)).toEqual([])
  expect(await row(db, 'select count(*)::int n from org_signup_bonuses where user_id=$1', [customer])).toEqual({ n: 0 })
  expect(await row(db, 'select error from org_signup_bonus_errors where user_id=$1', [customer]))
    .toEqual({ error: expect.stringContaining('bonus forced failure') })
})

it('lets only an admin set the bonus, within 0..1000, against the current form, and audits it', async () => {
  const { orgId } = await orgTeam(0)
  const stranger = await createUser(db)
  const at = await updatedAt(orgId)
  await refused(() => db.query('select admin_org_set_signup_bonus($1,$2,300,$3)', [stranger, orgId, at]), 'NOT_ADMIN')
  await refused(() => db.query('select admin_org_set_signup_bonus($1,$2,1001,$3)', [actor, orgId, at]), 'INVALID_INPUT')
  await refused(() => db.query('select admin_org_set_signup_bonus($1,$2,-1,$3)', [actor, orgId, at]), 'INVALID_INPUT')
  await refused(() => db.query("select admin_org_set_signup_bonus($1,$2,300,'2020-01-01')", [actor, orgId]), 'ORG_CHANGED')
  await refused(() => db.query('select admin_org_set_signup_bonus($1,gen_random_uuid(),300,$2)', [actor, at]), 'ORG_NOT_FOUND')

  const next = await setBonus(orgId, 1000)
  expect(Date.parse(next)).toBeGreaterThanOrEqual(Date.parse(at))
  expect(await row(db, 'select signup_bonus_credits from orgs where id=$1', [orgId])).toEqual({ signup_bonus_credits: 1000 })
  // Someone else saves the org (now() is fixed inside this test's transaction, so move it on).
  await db.query("update orgs set updated_at=updated_at+interval '1 second' where id=$1", [orgId])
  await refused(() => db.query('select admin_org_set_signup_bonus($1,$2,300,$3)', [actor, orgId, at]), 'ORG_CHANGED')
  expect(await row(db, "select reason::jsonb r from admin_audit_log where action='org_update' and target_id=$1 and user_id=$2 order by created_at desc limit 1", [orgId, actor]))
    .toEqual({ r: { signup_bonus_credits: { before: 0, after: 1000 } } })
  await refused(() => db.query('update orgs set signup_bonus_credits=1001 where id=$1', [orgId]), 'signup_bonus_credits_check')
})

it('keeps the new tables and the admin function away from clients', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('savepoint roles')
    await db.query(`set local role ${role}`)
    await expect(db.query('select * from org_signup_bonuses')).rejects.toThrow('permission denied')
    await db.query('rollback to savepoint roles')
    await db.query(`set local role ${role}`)
    await expect(db.query("select admin_org_set_signup_bonus(gen_random_uuid(),gen_random_uuid(),1,now())")).rejects.toThrow('permission denied')
    await db.query('rollback to savepoint roles')
  }
})

// 2010: the org's own partner link (?ref=<org account slug>) binds a new account as the org's
// customer through affiliate_bind ('signup'); it gets the bonus too, under the invite's checks.
const orgSlug = async (owner: string) => (await row(db, 'select slug from affiliates where user_id=$1', [owner])).slug as string
async function giftedUser() {
  const user = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])
  return user
}

it('gives a new account bound through the org\'s partner link the bonus once', async () => {
  const { orgId, owner } = await orgTeam(350)
  const customer = await giftedUser()
  expect(await bind(db, customer, await orgSlug(owner))).toBe(true)
  expect(await row(db, 'select referred_by,referred_source from profiles where id=$1', [customer])).toEqual({ referred_by: owner, referred_source: 'signup' })
  expect(await bonusLedger(customer)).toEqual([{ delta: 350, pool: 'free', idempotency_key: 'org_signup_bonus:' + customer }])
  expect(await freeCredits(customer)).toBe(6 + 350)
  expect(await bonusRow(customer)).toEqual({ org_id: orgId, member_user_id: null, credits: 350 })

  // A rebind and back, or a replayed binding, never pays again.
  await db.query('update profiles set referred_by=null,referred_source=null where id=$1', [customer])
  expect(await bind(db, customer, await orgSlug(owner))).toBe(true)
  expect(await bonusLedger(customer)).toHaveLength(1)
  expect(await freeCredits(customer)).toBe(6 + 350)
})

it('pays the org\'s amount through every enterprise referral link: the admin\'s ?ref link and each employee\'s invite link', async () => {
  const { orgId, owner, staff } = await orgTeam(350)
  const other = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [other, invite_token])

  const viaAdminLink = await giftedUser()
  expect(await bind(db, viaAdminLink, await orgSlug(owner))).toBe(true)
  const viaStaff = (await invitedBy(staff)).customer
  const viaOtherStaff = (await invitedBy(other)).customer
  const viaOwnerCode = (await invitedBy(owner)).customer
  for (const c of [viaAdminLink, viaStaff, viaOtherStaff, viaOwnerCode]) {
    expect(await bonusLedger(c)).toEqual([{ delta: 350, pool: 'free', idempotency_key: 'org_signup_bonus:' + c }])
  }
  expect(await row(db, 'select count(*)::int n from org_signup_bonuses where org_id=$1 and credits=350', [orgId])).toEqual({ n: 4 })
  // Staff who joined through the employee link (/join/org) got nothing from the org.
  for (const s of [staff, other]) expect(await bonusLedger(s)).toEqual([])
})

it('gives nothing through the partner link without a signup gift, to a member, at first checkout or while off', async () => {
  const { orgId, owner, staff } = await orgTeam(350)
  const slug = await orgSlug(owner)
  const noGift = await createUser(db)
  expect(await bind(db, noGift, slug)).toBe(true)
  expect(await bonusLedger(noGift)).toEqual([])
  expect(await row(db, 'select error from org_signup_bonus_errors where user_id=$1', [noGift])).toEqual({ error: 'blocked_no_signup_grant' })

  const member = await giftedUser()
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [member, invite_token])
  expect(await bind(db, member, slug)).toBe(true)
  expect(await bonusLedger(member)).toEqual([])
  expect(await row(db, 'select error from org_signup_bonus_errors where user_id=$1', [member])).toEqual({ error: 'blocked_org_member' })

  const buyer = await giftedUser()
  expect(await bind(db, buyer, slug, 'first_checkout')).toBe(true)
  expect(await bonusLedger(buyer)).toEqual([])

  await setOrg(orgId, { affiliate_enabled: false })
  const off = await giftedUser()
  await setOrg(orgId, { affiliate_enabled: true })
  await setBonus(orgId, 0)
  expect(await bind(db, off, slug)).toBe(true)
  expect(await bonusLedger(off)).toEqual([])
  expect(staff).toBeTruthy()
})

it('back-fills one partner-link customer once at the amount in force when bound; refuses who would not have qualified', async () => {
  const { orgId, owner } = await orgTeam(0)
  const slug = await orgSlug(owner)
  const audits = (sql: string) => db.query(`update admin_audit_log set created_at=now()-interval '${sql}' where target_id=$1 and created_at=now()`, [orgId])
  // Timeline (now() is fixed in the test transaction): bonus set to 350 two hours ago, the
  // affiliate switch off one hour ago and back on now.
  await setBonus(orgId, 350)
  await audits('2 hours')
  await setOrg(orgId, { affiliate_enabled: false })
  await audits('1 hour')
  await setOrg(orgId, { affiliate_enabled: true })

  // Bound through the link as before 2010 (the trigger did not cover it).
  await db.query('alter table profiles disable trigger org_signup_bonus_ref')
  const missed = await giftedUser()
  const noGift = await createUser(db)
  const early = await giftedUser()
  const offAtBind = await giftedUser()
  for (const u of [missed, noGift, early, offAtBind]) expect(await bind(db, u, slug)).toBe(true)
  await db.query('alter table profiles enable trigger org_signup_bonus_ref')
  await db.query("update profiles set referred_at=now()-interval '3 hours' where id=$1", [early])
  await db.query("update profiles set referred_at=now()-interval '30 minutes' where id=$1", [offAtBind])
  // Raised since, without going through the form: the back-fill still pays the amount then.
  await db.query('update orgs set signup_bonus_credits=500 where id=$1', [orgId])
  const personal = await promoter(db)
  const strangerCustomer = await giftedUser()
  expect(await bind(db, strangerCustomer, personal.slug)).toBe(true)

  const backfill = async (user: string, apply: boolean) =>
    (await row(db, 'select admin_org_signup_bonus_backfill($1,$2,$3) as r', [actor, user, apply])).r
  const stranger = await createUser(db)
  await refused(() => db.query('select admin_org_signup_bonus_backfill($1,$2,false)', [stranger, missed]), 'NOT_ADMIN')

  expect(await backfill(missed, false)).toMatchObject({ status: 'eligible', org_id: orgId, credits: 350, bonus_at_bind: 350, referred_at: expect.any(String) })
  expect(await bonusLedger(missed)).toEqual([])
  expect(await backfill(missed, true)).toMatchObject({ status: 'granted', org_id: orgId, credits: 350 })
  expect(await backfill(missed, true)).toEqual({ status: 'already' })
  expect(await bonusLedger(missed)).toEqual([{ delta: 350, pool: 'free', idempotency_key: 'org_signup_bonus:' + missed }])
  expect(await freeCredits(missed)).toBe(6 + 350)
  expect(await row(db, "select reason::jsonb r from admin_audit_log where action='org_update' and target_id=$1 and user_id=$2 and reason like '%backfill%'", [orgId, actor]))
    .toEqual({ r: { signup_bonus_backfill: { user: missed, credits: 350 } } })

  expect(await backfill(early, true)).toMatchObject({ status: 'not_eligible', reason: 'bonus_off_at_bind', bonus_at_bind: 0, bonus_now: 500 })
  expect(await backfill(offAtBind, true)).toMatchObject({ status: 'not_eligible', reason: 'affiliate_off_at_bind' })
  expect(await backfill(noGift, true)).toMatchObject({ status: 'not_eligible', reason: 'no_signup_gift_at_bind' })
  expect(await backfill(strangerCustomer, true)).toMatchObject({ status: 'not_eligible', reason: 'not_org_customer' })
  expect(await backfill(stranger, true)).toMatchObject({ status: 'not_eligible', reason: 'not_bound_by_link' })
  for (const u of [early, offAtBind, noGift, strangerCustomer]) expect(await bonusLedger(u)).toEqual([])
})

it('back-fill refuses when it cannot tell, or when the org, the gift or the trigger said no at the binding', async () => {
  const backfill = async (user: string) =>
    (await row(db, 'select admin_org_signup_bonus_backfill($1,$2,true) as r', [actor, user])).r
  const backdate = (orgId: string, ago: string) =>
    db.query(`update admin_audit_log set created_at=now()-interval '${ago}' where target_id=$1 and created_at=now()`, [orgId])
  const boundAgo = async (slug: string, user: string, ago: string) => {
    await db.query('alter table profiles disable trigger org_signup_bonus_ref')
    expect(await bind(db, user, slug)).toBe(true)
    await db.query('alter table profiles enable trigger org_signup_bonus_ref')
    await db.query(`update profiles set referred_at=now()-interval '${ago}' where id=$1`, [user])
  }
  // Each org has its own timeline; the bonus is set (audited) three hours ago.
  async function org() {
    const t = await orgTeam(350)
    await backdate(t.orgId, '3 hours')
    return { ...t, slug: await orgSlug(t.owner) }
  }
  const giftedAgo = async (ago: string) => {
    const u = await createUser(db)
    await db.query(`select grant_credits($1::uuid,6,'signup',$2,'free')`, [u, 'signup:' + u])
    await db.query(`update credit_ledger set created_at=now()-interval '${ago}' where idempotency_key=$1`, ['signup:' + u])
    return u
  }

  // The switch: off without an audit row (as an org created with it off), turned on (audited) only
  // after the binding. Nothing tells what it was then: refuse.
  const a = await org()
  await db.query('update orgs set affiliate_enabled=false where id=$1', [a.orgId])
  await setOrg(a.orgId, { affiliate_enabled: true })
  const unknownSwitch = await giftedAgo('2 hours')
  await boundAgo(a.slug, unknownSwitch, '1 hour')
  expect(await backfill(unknownSwitch)).toMatchObject({ status: 'not_eligible', reason: 'affiliate_unknown_at_bind' })

  // The org was suspended at the binding (audited), active again now.
  const b = await org()
  await setOrg(b.orgId, { status: 'suspended' })
  await backdate(b.orgId, '2 hours')
  await setOrg(b.orgId, { status: 'active' })
  const whileSuspended = await giftedAgo('2 hours')
  await boundAgo(b.slug, whileSuspended, '1 hour')
  expect(await backfill(whileSuspended)).toMatchObject({ status: 'not_eligible', reason: 'org_inactive_at_bind' })

  // The gift came only after the binding.
  const c = await org()
  const giftLater = await giftedAgo('10 minutes')
  await boundAgo(c.slug, giftLater, '1 hour')
  expect(await backfill(giftLater)).toMatchObject({ status: 'not_eligible', reason: 'no_signup_gift_at_bind' })

  // The trigger saw the binding and refused it (an active member of the org then): not a customer
  // the bug skipped, even after they leave.
  const refusedThen = await giftedAgo('2 hours')
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [c.orgId])
  await db.query('select org_join($1,$2)', [refusedThen, invite_token])
  expect(await bind(db, refusedThen, c.slug)).toBe(true)
  expect(await row(db, 'select error from org_signup_bonus_errors where user_id=$1', [refusedThen])).toEqual({ error: 'blocked_org_member' })
  await db.query("update org_members set status='removed',removed_at=now() where user_id=$1", [refusedThen])
  expect(await backfill(refusedThen)).toMatchObject({ status: 'not_eligible', reason: 'refused_by_trigger' })

  // Bound before its gift (the app's order since 2024): the gift's grant pays the bonus itself
  // (2023's rules), so there is nothing left to back-fill.
  const giftAfterBind = await createUser(db)
  expect(await bind(db, giftAfterBind, c.slug)).toBe(true)
  expect(await row(db, 'select error from org_signup_bonus_errors where user_id=$1', [giftAfterBind])).toEqual({ error: 'blocked_no_signup_grant' })
  await db.query(`select grant_credits($1::uuid,6,'signup',$2,'free')`, [giftAfterBind, 'signup:' + giftAfterBind])
  expect(await bonusLedger(giftAfterBind)).toHaveLength(1)
  expect(await backfill(giftAfterBind)).toEqual({ status: 'already' })

  // Control: the same org, a customer who did qualify then, is paid.
  const ok = await giftedAgo('2 hours')
  await boundAgo(c.slug, ok, '1 hour')
  expect(await backfill(ok)).toMatchObject({ status: 'granted', credits: 350 })
  for (const u of [unknownSwitch, whileSuspended, giftLater, refusedThen]) expect(await bonusLedger(u)).toEqual([])
})

it('keeps the back-fill away from clients', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('savepoint roles')
    await db.query(`set local role ${role}`)
    await expect(db.query('select admin_org_signup_bonus_backfill(gen_random_uuid(),gen_random_uuid(),false)')).rejects.toThrow('permission denied')
    await db.query('rollback to savepoint roles')
  }
})
