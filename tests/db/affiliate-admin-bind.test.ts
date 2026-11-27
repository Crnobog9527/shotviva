import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { bind, commission, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// admin_affiliate_bind_customer (2029, ARCHITECTURE §6.5 后台手动绑定): an admin binds a customer who
// already paid to a personal affiliate or an enterprise account, optionally with commissions for
// the customer's payments of the last N days. Each test runs in a transaction that is rolled back,
// so now() is fixed: payments are moved into the past by updating created_at.

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

type Answer = { changed: boolean; created: number; already: number; other_partner: number; failed: number; backdate_days: number }
const bindCustomer = async (input: object, by = actor) =>
  (await row(db, 'select admin_affiliate_bind_customer($1,$2) as r', [by, input])).r as Answer

async function refused(work: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(work()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

// An unbound customer's purchase made `days` ago (no commission: nobody was bound then).
async function pastSale(customer: string, days: number, amount = 2490) {
  const p = await sale(db, customer, 'pack_m', amount)
  await db.query("update payments set created_at=now()-make_interval(days=>$2) where id=$1", [p.id, days])
  return p
}

const changeRows = async (payment: string) =>
  Number((await row(db, 'select count(*) as n from affiliate_commission_changes x join affiliate_commissions c on c.id=x.commission_id where c.payment_id=$1', [payment])).n)

async function orgAccount() {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, input])).id as string
  await db.query('update orgs set signup_bonus_credits=500 where id=$1', [orgId])
  return { owner, orgId }
}

it('binds a paying customer to a personal affiliate and back-dates commissions for the last N days, once', async () => {
  const partner = await promoter(db)
  const customer = await createUser(db)
  const recent = await pastSale(customer, 10)
  const old = await pastSale(customer, 40)
  const r = await bindCustomer({ user_id: customer, affiliate_user_id: partner.id, reason: 'shop visit', backdate_days: 30 })
  expect(r).toMatchObject({ changed: true, created: 1, already: 0, other_partner: 0, failed: 0 })
  expect(await row(db, 'select referred_by,referred_source,referred_member,referred_via,referred_at=now() as now from profiles where id=$1', [customer]))
    .toEqual({ referred_by: partner.id, referred_source: 'admin', referred_member: null, referred_via: null, now: true })
  const rate = (await row(db, "select l1_bp from affiliate_rates where product_kind=(select kind from admin.catalog_products where product_id='pack_m')")).l1_bp
  const c = await row(db, `select c.affiliate_user_id,c.rate_bp,c.status,c.amount::int,c.confirm_after=p.created_at+make_interval(days=>s.hold_days) as hold_from_payment
    from affiliate_commissions c join payments p on p.id=c.payment_id cross join affiliate_settings s where c.payment_id=$1 and c.level=1`, [recent.id])
  expect(c).toMatchObject({ affiliate_user_id: partner.id, rate_bp: rate, hold_from_payment: true })
  expect(c.amount).toBeGreaterThan(0)
  expect(await commission(db, old.id)).toBeUndefined() // outside the 30 days

  // Idempotent: running again changes nothing and writes no change row.
  const changes = await changeRows(recent.id)
  expect(await bindCustomer({ user_id: customer, affiliate_user_id: partner.id, reason: 'again', backdate_days: 30 }))
    .toMatchObject({ changed: false, created: 0, already: 1 })
  expect(await changeRows(recent.id)).toBe(changes)
  expect(Number((await row(db, 'select count(*) as n from affiliate_commissions where payment_id=$1', [recent.id])).n)).toBe(1)
  expect(await row(db, 'select referred_source from profiles where id=$1', [customer])).toEqual({ referred_source: 'admin' })

  const audit = (await db.query("select reason from admin_audit_log where action='affiliate_rebind' and target_id=$1 and user_id=$2 order by id", [customer, actor])).rows
  expect(audit).toHaveLength(2)
  expect(audit[0].reason).toContain('backdate 30d: created 1')
  expect(audit[0].reason).toContain('shop visit')
})

it('without back-dating creates no commission for earlier payments; payments after the binding earn as normal', async () => {
  const partner = await promoter(db)
  const customer = await createUser(db)
  const before = await pastSale(customer, 5)
  expect(await bindCustomer({ user_id: customer, affiliate_user_id: partner.id, reason: 'no backdate' })).toMatchObject({ created: 0, backdate_days: 0 })
  expect(await commission(db, before.id)).toBeUndefined()
  // A refund on the earlier payment does not create one either (the recompute only updates existing rows).
  await refund(db, before.charge, 500)
  expect(await commission(db, before.id)).toBeUndefined()
  const after = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, after.id)).toMatchObject({ status: 'pending' })
})

it("never takes over a payment that already carries another partner's commission", async () => {
  const first = await promoter(db)
  const second = await promoter(db)
  const customer = await createUser(db)
  await bind(db, customer, first.slug)
  const owned = await sale(db, customer, 'pack_m', 2490)
  await db.query("update payments set created_at=now()-interval '3 days' where id=$1", [owned.id])
  await db.query("update profiles set referred_by=null,referred_source=null,referred_at=null where id=$1", [customer])
  const free = await pastSale(customer, 2)
  expect(await bindCustomer({ user_id: customer, affiliate_user_id: second.id, reason: 'moved', backdate_days: 7 }))
    .toMatchObject({ created: 1, other_partner: 1 })
  expect((await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1 and level=1', [owned.id])).affiliate_user_id).toBe(first.id)
  expect((await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1 and level=1', [free.id])).affiliate_user_id).toBe(second.id)
})

it('back-dated commissions follow the normal rules afterwards: refunds, the commission term, the same_ip hold, level 2', async () => {
  await db.query('update affiliate_settings set commission_months=1')
  const parent = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [parent.id])
  const partner = await promoter(db, parent.id)
  const customer = await createUser(db)
  await db.query("update profiles set signup_ip='203.0.113.77' where id=any($1::uuid[])", [[partner.id, customer]])
  const p = await pastSale(customer, 20)
  expect(await bindCustomer({ user_id: customer, affiliate_user_id: partner.id, reason: 'term', backdate_days: 25 })).toMatchObject({ created: 1 })
  expect(await commission(db, p.id, 1)).toMatchObject({ status: 'on_hold', flags: ['same_ip'] })
  expect(await commission(db, p.id, 2)).toMatchObject({ status: 'on_hold' })
  // A later recompute keeps the row (owner, rate, confirm_after) and applies the refund.
  const before = await row(db, 'select affiliate_user_id,rate_bp,confirm_after from affiliate_commissions where payment_id=$1 and level=1', [p.id])
  await refund(db, p.charge, 2490)
  expect(await commission(db, p.id, 1)).toMatchObject({ amount: 0, status: 'void', void_reason: 'refunded' })
  expect(await row(db, 'select affiliate_user_id,rate_bp,confirm_after from affiliate_commissions where payment_id=$1 and level=1', [p.id])).toEqual(before)
  await db.query('select admin_affiliate_recompute($1,$2)', [actor, p.id])
  expect(await row(db, 'select affiliate_user_id,rate_bp,confirm_after from affiliate_commissions where payment_id=$1 and level=1', [p.id])).toEqual(before)
})

it('binds to an enterprise account: level-1 commission to the org, no member, no signup bonus; refuses its own staff', async () => {
  const { owner, orgId } = await orgAccount()
  const customer = await createUser(db)
  const p = await pastSale(customer, 3)
  const freeBefore = (await row(db, 'select free_credits from profiles where id=$1', [customer])).free_credits
  expect(await bindCustomer({ user_id: customer, affiliate_user_id: owner, reason: 'counter sale', backdate_days: 7 })).toMatchObject({ created: 1 })
  expect(await commission(db, p.id)).toMatchObject({ status: 'pending', flags: [] })
  expect((await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1 and level=1', [p.id])).affiliate_user_id).toBe(owner)
  expect(await row(db, 'select referred_member,referred_source from profiles where id=$1', [customer])).toEqual({ referred_member: null, referred_source: 'admin' })
  expect(await row(db, 'select count(*)::int as n from org_signup_bonuses where user_id=$1', [customer])).toEqual({ n: 0 })
  expect(await row(db, 'select count(*)::int as n from org_signup_bonus_errors where user_id=$1', [customer])).toEqual({ n: 0 })
  expect((await row(db, 'select free_credits from profiles where id=$1', [customer])).free_credits).toBe(freeBefore)
  // Even a never-paid account bound by an admin gets no org signup bonus.
  const fresh = await createUser(db)
  await bindCustomer({ user_id: fresh, affiliate_user_id: owner, reason: 'fresh' })
  expect(await row(db, 'select count(*)::int as n from org_signup_bonuses where user_id=$1', [fresh])).toEqual({ n: 0 })

  const staff = await createUser(db)
  await db.query("insert into org_members(org_id,user_id,role) values($1,$2,'member')", [orgId, staff])
  await refused(() => bindCustomer({ user_id: staff, affiliate_user_id: owner, reason: 'x' }), 'AFFILIATE_ORG_MEMBER')
})

it('refuses non-admins, banned admins, bad input, inactive partners, banned customers and a disabled program', async () => {
  const partner = await promoter(db)
  const customer = await createUser(db)
  const base = { user_id: customer, affiliate_user_id: partner.id, reason: 'r' }
  const stranger = await createUser(db)
  await refused(() => bindCustomer(base, stranger), 'NOT_ADMIN')
  const banned = await createUser(db)
  await db.query("update profiles set role='admin',banned_at=now() where id=$1", [banned])
  await refused(() => bindCustomer(base, banned), 'NOT_ADMIN')
  await refused(() => bindCustomer({ ...base, backdate_days: 91 }), 'INVALID_INPUT')
  await refused(() => bindCustomer({ ...base, backdate_days: -1 }), 'INVALID_INPUT')
  await refused(() => bindCustomer({ ...base, reason: ' ' }), 'INVALID_INPUT')
  await refused(() => bindCustomer({ ...base, affiliate_user_id: null }), 'INVALID_INPUT')
  await refused(() => bindCustomer({ ...base, user_id: partner.id }), 'INVALID_INPUT')
  await refused(() => bindCustomer({ ...base, affiliate_user_id: stranger }), 'AFFILIATE_NOT_ACTIVE')
  await db.query("update affiliates set status='suspended' where user_id=$1", [partner.id])
  await refused(() => bindCustomer(base), 'AFFILIATE_NOT_ACTIVE')
  await db.query("update affiliates set status='active' where user_id=$1", [partner.id])
  await db.query('update profiles set banned_at=now() where id=$1', [customer])
  await refused(() => bindCustomer(base), 'USER_BANNED')
  await db.query('update profiles set banned_at=null where id=$1', [customer])
  await db.query('update affiliate_settings set enabled=false')
  await refused(() => bindCustomer({ ...base, backdate_days: 5 }), 'AFFILIATE_PROGRAM_OFF')
  expect(await row(db, 'select referred_by from profiles where id=$1', [customer])).toEqual({ referred_by: null })
  // Only the service role may call it.
  expect(await row(db, `select has_function_privilege('anon','admin_affiliate_bind_customer(uuid,jsonb)','execute') as anon,
    has_function_privilege('authenticated','admin_affiliate_bind_customer(uuid,jsonb)','execute') as auth,
    has_function_privilege('service_role','admin_affiliate_bind_customer(uuid,jsonb)','execute') as service`))
    .toEqual({ anon: false, auth: false, service: true })
})

it('an org_l1 / signup customer re-bound to the same org cannot be back-dated, and its pre-binding payments never count for promo', async () => {
  const { orgId, owner } = await orgAccount()
  await db.query('select admin_partner_promo_set($1,$2)', [actor, { org_id: orgId, on: true }])
  const period = (await row(db, "select to_char(now() at time zone 'UTC','YYYY-MM') as p")).p as string
  const inPrevious = (await row(db, "select (date_trunc('month', now() at time zone 'UTC') - interval '10 days') at time zone 'UTC' as t")).t
  const payments: Record<string, { before: string; after: string }> = {}
  for (const source of ['org_l1', 'signup', 'first_checkout']) {
    const customer = await createUser(db)
    const before = await pastSale(customer, 5)
    await db.query("update profiles set referred_by=$2,referred_source=$3,referred_at=now()-interval '1 day' where id=$1", [customer, owner, source])
    // Re-binding to the same org with back-dating is refused and changes nothing.
    await refused(() => bindCustomer({ user_id: customer, affiliate_user_id: owner, reason: 'x', backdate_days: 10 }), 'AFFILIATE_BACKDATE_NOT_ADMIN')
    expect(await row(db, 'select referred_source from profiles where id=$1', [customer])).toEqual({ referred_source: source })
    expect(await commission(db, before.id)).toBeUndefined()
    // Without back-dating it is a no-op on the profile.
    expect(await bindCustomer({ user_id: customer, affiliate_user_id: owner, reason: 'y' })).toMatchObject({ changed: false, created: 0 })
    expect(await row(db, 'select referred_source from profiles where id=$1', [customer])).toEqual({ referred_source: source })
    const after = await sale(db, customer, 'pack_m', 2490)
    // Even a commission that somehow exists on a pre-binding payment is left out of the promo sheet.
    await db.query('select affiliate_recompute_payment($1,true)', [before.id])
    payments[source] = { before: String(before.id), after: String(after.id) }
  }
  const all = Object.values(payments).flatMap((p) => [p.before, p.after])
  await db.query("update affiliate_commissions set status='confirmed',confirmed_at=$2,confirm_after=$2 where payment_id=any($1::bigint[]) and level=1", [all, inPrevious])
  await db.query('select partner_promo_run($1)', [period])
  const lines = (await db.query(`select l.payment_id::text from partner_promo_grant_lines l join partner_promo_grants g on g.id=l.grant_id
    where g.org_id=$1 and g.period=$2 order by 1`, [orgId, period])).rows.map((r) => r.payment_id)
  expect(lines).toEqual(Object.values(payments).map((p) => p.after).sort())
})

it('promotion credits: an admin-bound enterprise customer counts with payments after the binding, not back-dated ones', async () => {
  const { orgId, owner } = await orgAccount()
  await db.query('select admin_partner_promo_set($1,$2)', [actor, { org_id: orgId, on: true }])
  const customer = await createUser(db)
  const early = await pastSale(customer, 5)
  await bindCustomer({ user_id: customer, affiliate_user_id: owner, reason: 'promo', backdate_days: 10 })
  const later = await sale(db, customer, 'pack_m', 2490)
  const period = (await row(db, "select to_char(now() at time zone 'UTC','YYYY-MM') as p")).p as string
  const inPrevious = (await row(db, "select (date_trunc('month', now() at time zone 'UTC') - interval '10 days') at time zone 'UTC' as t")).t
  const { rowCount } = await db.query("update affiliate_commissions set status='confirmed',confirmed_at=$2,confirm_after=$2 where payment_id=any($1::bigint[]) and level=1",
    [[early.id, later.id], inPrevious])
  expect(rowCount).toBe(2)
  await db.query('select partner_promo_run($1)', [period])
  const lines = (await db.query(`select l.payment_id::text from partner_promo_grant_lines l join partner_promo_grants g on g.id=l.grant_id
    where g.org_id=$1 and g.period=$2`, [orgId, period])).rows.map((r) => r.payment_id)
  expect(lines).toEqual([String(later.id)])
})
