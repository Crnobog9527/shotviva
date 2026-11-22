import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, confirm, fiveCustomers, freeOf, months, partner, refused, run, sheet } from './partner-promo-fixtures'

// Ad-hoc top-ups of channel partner promotion credits (ARCHITECTURE §6.5 渠道商推广积分「临时追加」,
// migrations 1845–1847): free pool of the owner only, once per form, admin only, expired at month
// end together with the monthly grant, and invisible to the monthly formula.
let db: Client
let actor: string
let m: Awaited<ReturnType<typeof months>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await adminActor(db)
  m = await months(db)
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

type Answer = { applied: boolean; reason?: string; topup_id?: number; credits?: number }
const topup = async (who: string, input: object) =>
  (await row(db, 'select admin_partner_promo_topup($1,$2) as r', [who, input])).r as Answer
// The form as the tab renders it for a partner: its owner and this month, a fresh request key.
const form = (orgId: string, owner: string, credits: number | string, extra: object = {}) =>
  ({ org_id: orgId, recipient: owner, period: m.current, credits, reason: 'first month, no sales yet', request_key: randomUUID(), ...extra })

async function spend(user: string, job: string, amount: number, ago: string) {
  const key = job + (amount > 0 ? ':reserve' : ':refund')
  await db.query("select _apply_credit_change($1,'free',$2,$3,'job',$4)", [user, amount > 0 ? 'reserve' : 'refund', -amount, key])
  await db.query('update credit_ledger set created_at=now()-$2::interval where idempotency_key=$1', [key, ago])
}
const expirePass = async () => (await row(db, 'select partner_promo_expire_run() as r')).r
const at = (table: string, id: string | number, made: string, column = 'created_at') =>
  db.query(`update ${table} set ${column}=now()-$2::interval, expires_at=now() where id=$1`, [id, made])

it("grants a top-up to the owner's free pool only, audited, never the org pool", async () => {
  const { orgId, owner } = await partner(db, actor)
  const staff = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [staff, invite_token])
  const answer = await topup(actor, form(orgId, owner, 5000))
  expect(answer).toMatchObject({ applied: true, credits: 5000 })
  expect(await row(db, 'select credits,free_credits from profiles where id=$1', [owner])).toEqual({ credits: 0, free_credits: 5000 })
  expect(await row(db, `select period,recipient_user_id,credits,reason,created_by,
      expires_at = (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC' as month_end
      from partner_promo_topups where id=$1`, [answer.topup_id]))
    .toEqual({ period: m.current, recipient_user_id: owner, credits: 5000, reason: 'first month, no sales yet', created_by: actor, month_end: true })
  expect(await row(db, "select pool,delta from credit_ledger where idempotency_key=$1", ['partner_promo_topup:' + answer.topup_id]))
    .toEqual({ pool: 'free', delta: 5000 })
  const audit = await row(db, "select user_id,target_id,reason from admin_audit_log where action='partner_promo_topup'")
  expect(audit).toMatchObject({ user_id: actor, target_id: String(answer.topup_id) })
  expect(JSON.parse(audit.reason)).toMatchObject({ org_id: orgId, credits: 5000, reason: 'first month, no sales yet' })
  expect(await row(db, 'select pool_credits::int p from orgs where id=$1', [orgId])).toEqual({ p: 0 })
  expect(await row(db, 'select count(*)::int n from org_credit_ledger where org_id=$1', [orgId])).toEqual({ n: 0 })
  await refused(db, () => db.query("select org_allocate($1,$2,5000,'topup-move')", [owner, staff]), 'ORG_POOL_INSUFFICIENT')
  expect(await row(db, 'select free_credits,credits from profiles where id=$1', [staff])).toEqual({ free_credits: 0, credits: 0 })
})

it('grants a double submit once', async () => {
  const { orgId, owner } = await partner(db, actor)
  const input = form(orgId, owner, 3000)
  expect(await topup(actor, input)).toMatchObject({ applied: true })
  expect(await topup(actor, input)).toMatchObject({ applied: false, reason: 'already', credits: 3000 })
  expect(await topup(actor, { ...input, credits: 9000 })).toMatchObject({ applied: false, reason: 'already', credits: 3000 })
  expect(await freeOf(db, owner)).toBe(3000)
  expect(await row(db, 'select count(*)::int n from partner_promo_topups where org_id=$1', [orgId])).toEqual({ n: 1 })
  expect(await row(db, "select count(*)::int n from admin_audit_log where action='partner_promo_topup'")).toEqual({ n: 1 })
  const other = await partner(db, actor)
  await refused(db, () => topup(actor, { ...input, org_id: other.orgId, recipient: other.owner }), 'IDEMPOTENCY_CONFLICT')
  // A second form (new key) is a second top-up.
  expect(await topup(actor, form(orgId, owner, 2000))).toMatchObject({ applied: true })
  expect(await freeOf(db, owner)).toBe(5000)
})

it('refuses a non-admin, bad input, a non-partner and a stale form', async () => {
  const { orgId, owner } = await partner(db, actor)
  await refused(db, async () => topup(await createUser(db), form(orgId, owner, 1000)), 'NOT_ADMIN')
  await refused(db, () => topup(owner, form(orgId, owner, 1000)), 'NOT_ADMIN')
  for (const bad of [form(orgId, owner, 0), form(orgId, owner, 100001), form(orgId, owner, '1e3'), form(orgId, owner, -5),
    form(orgId, owner, 1000, { reason: '   ' }), form(orgId, owner, 1000, { reason: 'x'.repeat(501) }),
    form(orgId, owner, 1000, { request_key: 'nope' }), form(orgId, owner, 1000, { period: '2026-13' })]) {
    await refused(db, () => topup(actor, bad), 'INVALID_INPUT')
  }
  expect(await topup(actor, form(orgId, owner, 100000))).toMatchObject({ applied: true })
  // The owner or the month changed since the form was shown: nothing granted.
  expect(await topup(actor, form(orgId, await createUser(db), 1000))).toEqual({ applied: false, reason: 'changed' })
  expect(await topup(actor, form(orgId, owner, 1000, { period: m.previous }))).toEqual({ applied: false, reason: 'changed' })
  const plain = await partner(db, actor, false)
  await refused(db, () => topup(actor, form(plain.orgId, plain.owner, 1000)), 'PROMO_PARTNER_OFF')
  await db.query("update orgs set status='suspended' where id=$1", [orgId])
  await refused(db, () => topup(actor, form(orgId, owner, 1000)), 'PROMO_PARTNER_OFF')
  expect(await freeOf(db, owner)).toBe(100000)
  expect(await row(db, `select has_function_privilege('anon','public.admin_partner_promo_topup(uuid,jsonb)','execute') a,
    has_function_privilege('authenticated','public.admin_partner_promo_topup(uuid,jsonb)','execute') u,
    has_function_privilege('service_role','public.admin_partner_promo_topup(uuid,jsonb)','execute') s,
    has_function_privilege('service_role','public._partner_promo_bucket_left(uuid,timestamptz)','execute') b,
    has_table_privilege('authenticated','public.partner_promo_topups','select') t`)).toEqual({ a: false, u: false, s: true, b: false, t: false })
})

it('expires what is left of the monthly grant and its top-ups together, once and never more', async () => {
  const { orgId, owner } = await partner(db, actor)
  await db.query('update profiles set free_credits=700 where id=$1', [owner])
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // 10,000
  await at('partner_promo_grants', s.id, '50 minutes', 'decided_at')
  await spend(owner, 'job:a', 4000, '40 minutes')
  const t = await topup(actor, form(orgId, owner, 5000))
  await at('partner_promo_topups', t.topup_id!, '30 minutes')
  await spend(owner, 'job:b', 3500, '20 minutes')
  await spend(owner, 'job:b', -500, '20 minutes') // a failed job's credits come back
  expect(await freeOf(db, owner)).toBe(700 + 10000 - 4000 + 5000 - 3000)
  // Left: 10,000 + 5,000 − 7,000 = 8,000 (measured one by one it would be 3,000 + 0).
  expect(await expirePass()).toMatchObject({ expired: 2, taken: 8000, overdue: 0, failed: [] })
  expect(await freeOf(db, owner)).toBe(700)
  expect(await row(db, 'select expired_credits,expired_basis from partner_promo_grants where id=$1', [s.id])).toEqual({ expired_credits: 3000, expired_basis: 3000 })
  expect(await row(db, 'select expired_credits,expired_basis from partner_promo_topups where id=$1', [t.topup_id])).toEqual({ expired_credits: 5000, expired_basis: 5000 })
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 0 })
  expect(await row(db, "select count(*)::int n, sum(delta)::int d from credit_ledger where kind='partner_promo_expire' and user_id=$1", [owner]))
    .toEqual({ n: 2, d: -8000 })
})

it('does not take back a top-up for spending that happened before it', async () => {
  const { orgId, owner } = await partner(db, actor)
  await db.query('update profiles set free_credits=3000 where id=$1', [owner])
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // 10,000
  await at('partner_promo_grants', s.id, '50 minutes', 'decided_at')
  await spend(owner, 'job:big', 12000, '40 minutes') // the grant and 2,000 of the owner's own credits
  const t = await topup(actor, form(orgId, owner, 5000))
  await at('partner_promo_topups', t.topup_id!, '30 minutes')
  await spend(owner, 'job:small', 1000, '20 minutes')
  // Left: the grant 0, the top-up 4,000 (not 15,000 − 13,000 = 2,000; the owner's 1,000 stays).
  expect(await expirePass()).toMatchObject({ expired: 2, taken: 4000 })
  expect(await freeOf(db, owner)).toBe(1000)
})

it('expires a top-up on its own and takes back a late refund once', async () => {
  const { orgId, owner } = await partner(db, actor)
  const t = await topup(actor, form(orgId, owner, 6000))
  await at('partner_promo_topups', t.topup_id!, '30 minutes')
  await spend(owner, 'job:late', 2500, '10 minutes')
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 3500 })
  await db.query("select _apply_credit_change($1,'free','refund',2500,'job','job:late:refund')", [owner])
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 2500 })
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 0 })
  expect(await freeOf(db, owner)).toBe(0)
  expect(await row(db, 'select expired_credits,expired_basis from partner_promo_topups where id=$1', [t.topup_id])).toEqual({ expired_credits: 6000, expired_basis: 6000 })
})

it('reports a failed top-up expiry and flags it overdue; the next pass retries', async () => {
  const { orgId, owner } = await partner(db, actor)
  const t = await topup(actor, form(orgId, owner, 2000))
  await db.query("update partner_promo_topups set created_at=now()-interval '3 hours', expires_at=now()-interval '2 hours' where id=$1", [t.topup_id])
  await db.query(`create function pg_temp.fail_expiry() returns trigger language plpgsql as $$
    begin if new.kind = 'partner_promo_expire' then raise exception 'forced'; end if; return new; end $$`)
  await db.query('create trigger fail_expiry before insert on credit_ledger for each row execute function pg_temp.fail_expiry()')
  const failed = await expirePass()
  expect(failed).toMatchObject({ expired: 0, taken: 0, overdue: 1 })
  expect(failed.failed).toEqual([{ grant_id: 0, topup_id: t.topup_id, error: 'forced' }])
  await db.query('drop trigger fail_expiry on credit_ledger')
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 2000, overdue: 0, failed: [] })
  expect(await freeOf(db, owner)).toBe(0)
})

it("leaves the monthly formula alone: this month's sheet and next month's computed sheet are the same with a top-up", async () => {
  const { orgId, owner } = await partner(db, actor)
  await fiveCustomers(db, owner, 20000, m.in_previous)
  const next = (await row(db, "select to_char((now() at time zone 'UTC') + interval '1 month','YYYY-MM') p")).p as string
  const calc = async () => (await row(db, 'select _partner_promo_calc($1,$2) c', [orgId, next])).c
  await run(db, m.current)
  const before = await sheet(db, orgId, m.current)
  await db.query('savepoint no_topup')
  await topup(actor, form(orgId, owner, 7000))
  await run(db, m.current)
  const after = await sheet(db, orgId, m.current)
  expect(after).toEqual(before)
  // The month ends with and without the top-up; next month's sheet is computed the same.
  const monthEnd = async (expected: number) => {
    expect(await confirm(db, actor, await sheet(db, orgId, m.current))).toMatchObject({ applied: true, total: 20000 })
    await db.query('update partner_promo_grants set expires_at=now() where org_id=$1', [orgId])
    await db.query('update partner_promo_topups set expires_at=now() where org_id=$1', [orgId])
    expect(await expirePass()).toMatchObject({ taken: expected })
    expect(await freeOf(db, owner)).toBe(0)
    return calc()
  }
  const withTopup = await monthEnd(27000)
  await db.query('rollback to savepoint no_topup')
  const without = await monthEnd(20000)
  expect(withTopup).toEqual(without)
  expect(without).toMatchObject({ base: 10000, bonus: 0, clawback_owed: 0, total: 10000 })
})
