import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import {
  adminActor, confirm, fiveCustomers, asLegacy, freeOf, months, partner, promoPoolOf, refused, run, sheet, type Sheet,
} from './partner-promo-fixtures'

// Channel partner promotion grants after the confirm (ARCHITECTURE §6.5 渠道商推广积分): refunds after
// confirmation clawed back from later months with carry-forward, month-end expiry, and credits that
// stay on the owner's own account (never the org pool).
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

// A free-pool reserve (amount > 0) or a refund (amount < 0) of job `job`, booked `ago` before now.
async function spend(user: string, job: string, amount: number, ago: string) {
  const key = job + (amount > 0 ? ':reserve' : ':refund')
  await db.query("select _apply_credit_change($1,'free',$2,$3,'job',$4)", [user, amount > 0 ? 'reserve' : 'refund', -amount, key])
  await db.query('update credit_ledger set created_at=now()-$2::interval where idempotency_key=$1', [key, ago])
}
const expirePass = async () => (await row(db, 'select partner_promo_expire_run() as r')).r

// A granted base-only sheet for this month whose grant was `granted` ago and which expired `expired` ago.
async function grantedThenExpired(granted: string, expired: string) {
  const { orgId, owner } = await partner(db, actor)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s)
  await asLegacy(db, 'partner_promo_grants', s.id)
  await db.query('update partner_promo_grants set decided_at=now()-$2::interval, expires_at=now()-$3::interval where id=$1', [s.id, granted, expired])
  return { owner, s }
}

// Last month's sheet, confirmed as if within its month (its window is the month before it; the
// expiry is moved forward only so the confirm is allowed).
async function grantedLastMonth(orgId: string): Promise<Sheet> {
  await run(db, m.previous)
  await db.query("update partner_promo_grants set expires_at=now()+interval '1 day' where org_id=$1 and period=$2", [orgId, m.previous])
  const s = await sheet(db, orgId, m.previous)
  expect(await confirm(db, actor, s)).toMatchObject({ applied: true })
  return s
}

it('claws a refund after confirmation back from the next grant, down to 0, and carries the rest forward', async () => {
  const { orgId, owner } = await partner(db, actor)
  const sales = await fiveCustomers(db, owner, 600000, m.in_before)
  const last = await grantedLastMonth(orgId)
  expect(last).toMatchObject({ bonus: 300000, total: 310000 })
  const granted = await promoPoolOf(db, orgId)
  expect(granted).toBe(310000)

  // Every order is refunded after its sheet was confirmed: the whole 300,000 bonus is owed.
  for (const s of sales) await db.query("select record_payment_issue($1,'refunded',2490)", [s.charge])
  expect(await promoPoolOf(db, orgId)).toBe(granted) // credits already granted are never touched
  await run(db, m.current)
  const now = await sheet(db, orgId, m.current)
  expect(now).toMatchObject({ base: 10000, bonus: 0, clawback_owed: 300000, clawback_applied: 10000, total: 0 })
  expect(now.detail.sources).toEqual([{ grant_id: Number(last.id), period: m.previous, owed: 300000, applied: 10000 }])
  expect(await confirm(db, actor, now)).toMatchObject({ applied: true, total: 0 })
  expect(await promoPoolOf(db, orgId)).toBe(granted)
  expect(await freeOf(db, owner)).toBe(0)
  expect(await row(db, 'select credits from partner_promo_clawbacks where source_grant_id=$1 and applied_grant_id=$2', [last.id, now.id]))
    .toEqual({ credits: 10000 })

  // The month after: 290,000 still owed, another 10,000 taken.
  const next = (await row(db, "select _partner_promo_calc($1, to_char((now() at time zone 'UTC') + interval '1 month','YYYY-MM')) as c", [orgId])).c
  expect(next).toMatchObject({ clawback_owed: 290000, clawback_applied: 10000, total: 0 })
})

it('claws back pro rata: a partial refund takes back only the bonus it changed', async () => {
  const { orgId, owner } = await partner(db, actor)
  const sales = await fiveCustomers(db, owner, 100000, m.in_before)
  await grantedLastMonth(orgId) // bonus 50,000
  await fiveCustomers(db, owner, 100000, m.in_previous)
  await db.query("select record_payment_issue($1,'refunded',1245)", [sales[0]!.charge])
  await run(db, m.current)
  // Last month re-measured: raw 450,000 → cap 90,000: 50,000 + 4 × 90,000 = 410,000 → 41,000 (owed 9,000).
  // This month: 5 × 100,000 → 50,000 bonus, base 10,000, minus 9,000.
  expect(await sheet(db, orgId, m.current)).toMatchObject({ bonus: 50000, clawback_owed: 9000, clawback_applied: 9000, total: 51000 })
})

it('expires what is left at month end; promotion credits are spent first, other free credits stay', async () => {
  const { orgId, owner } = await partner(db, actor)
  await db.query('update profiles set free_credits=700 where id=$1', [owner])
  await fiveCustomers(db, owner, 20000, m.in_previous)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // 20,000
  await asLegacy(db, 'partner_promo_grants', s.id)
  // 3,000 spent (reserve 3,500, a failed job's 500 refunded) during the month.
  await spend(owner, 'job:t1', 3500, '1 minute')
  await spend(owner, 'job:t1', -500, '1 minute')
  await db.query("update partner_promo_grants set decided_at=now()-interval '2 minutes', expires_at=now() where id=$1", [s.id])
  expect(await freeOf(db, owner)).toBe(700 + 20000 - 3000)

  expect(await run(db, m.current)).toMatchObject({ expired: 1, taken: 17000, failed_expiries: [] })
  expect(await freeOf(db, owner)).toBe(700)
  expect(await row(db, 'select expired_credits,expired_at is not null as done from partner_promo_grants where id=$1', [s.id]))
    .toEqual({ expired_credits: 17000, done: true })
  expect(await run(db, m.current)).toMatchObject({ expired: 0, taken: 0 })
  expect(await row(db, "select count(*)::int n from credit_ledger where kind='partner_promo_expire' and user_id=$1", [owner])).toEqual({ n: 1 })
})

it('never takes more than the free balance at expiry', async () => {
  const { orgId, owner } = await partner(db, actor)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // base only
  await asLegacy(db, 'partner_promo_grants', s.id)
  // Spent outside the reserve/refund kinds the run measures (e.g. an admin correction).
  await db.query("select _apply_credit_change($1,'free','admin_adjust',-9000,'fix','t:a')", [owner])
  await db.query("update partner_promo_grants set expires_at=now() where id=$1", [s.id])
  expect(await run(db, m.current)).toMatchObject({ taken: 1000 })
  expect(await freeOf(db, owner)).toBe(0)
})

it('lapses an undecided sheet whose month is over and refuses to confirm it', async () => {
  const { orgId } = await partner(db, actor)
  await run(db, m.previous)
  const old = await sheet(db, orgId, m.previous)
  await refused(db, () => confirm(db, actor, old), 'PROMO_GRANT_EXPIRED')
  expect(await run(db, m.current)).toMatchObject({ lapsed: 1 })
  expect((await sheet(db, orgId, m.previous)).status).toBe('lapsed')
  await refused(db, () => confirm(db, actor, old), 'PROMO_GRANT_DECIDED')
})

it("grants into the org's promo pool, not the owner's account nor the paid pool", async () => {
  const { orgId, owner } = await partner(db, actor)
  const staff = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [staff, invite_token])
  await fiveCustomers(db, owner, 60000, m.in_previous)
  await run(db, m.current)
  await confirm(db, actor, await sheet(db, orgId, m.current))
  expect(await row(db, `select pool_credits::int p, promo_pool_credits::int q,
      promo_expires_at = (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC' as month_end
      from orgs where id=$1`, [orgId])).toEqual({ p: 0, q: 40000, month_end: true })
  expect(await row(db, 'select credits,free_credits from profiles where id=$1', [owner])).toEqual({ credits: 0, free_credits: 0 })
  // Paid allocations cannot touch promotion credits; promotion allocations land in the free pool.
  await refused(db, () => db.query("select org_allocate($1,$2,40000,'promo-move')", [owner, staff]), 'ORG_POOL_INSUFFICIENT')
  await db.query("select org_allocate_promo($1,$2,1500,'promo-give')", [owner, staff])
  expect(await row(db, 'select free_credits,credits from profiles where id=$1', [staff])).toEqual({ free_credits: 1500, credits: 0 })
})

it('counts a refund at its own reserve: one for a job reserved before the grant frees nothing of it', async () => {
  const { orgId, owner } = await partner(db, actor)
  await db.query('update profiles set free_credits=1000 where id=$1', [owner])
  await spend(owner, 'job:before', 600, '1 hour') // reserved before the grant, from the owner's own credits
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // 10,000
  await asLegacy(db, 'partner_promo_grants', s.id)
  await db.query("update partner_promo_grants set decided_at=now()-interval '30 minutes', expires_at=now() where id=$1", [s.id])
  await spend(owner, 'job:inside', 3000, '10 minutes') // spent from the grant
  await spend(owner, 'job:before', -600, '5 minutes') // the earlier job fails after the grant
  expect(await freeOf(db, owner)).toBe(1000 - 600 + 10000 - 3000 + 600)
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 7000, overdue: 0, failed: [] })
  expect(await freeOf(db, owner)).toBe(1000)
})

it('takes back a refund that lands after the expiry for a job reserved before it, once', async () => {
  const { owner, s } = await grantedThenExpired('30 minutes', '1 minute')
  await spend(owner, 'job:late', 4000, '10 minutes')
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 6000 })
  expect(await freeOf(db, owner)).toBe(0)
  await db.query("select _apply_credit_change($1,'free','refund',4000,'job','job:late:refund')", [owner]) // the job failed after midnight
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 4000 })
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 0 })
  expect(await freeOf(db, owner)).toBe(0)
  expect(await row(db, 'select expired_credits,expired_basis from partner_promo_grants where id=$1', [s.id])).toEqual({ expired_credits: 10000, expired_basis: 10000 })
  expect(await row(db, "select count(*)::int n from credit_ledger where kind='partner_promo_expire' and user_id=$1", [owner])).toEqual({ n: 2 })
})

it('reports a failed expiry and flags it overdue an hour after the month ended; the next pass retries', async () => {
  const { owner } = await grantedThenExpired('3 hours', '2 hours')
  await db.query(`create function pg_temp.fail_expiry() returns trigger language plpgsql as $$
    begin if new.kind = 'partner_promo_expire' then raise exception 'forced'; end if; return new; end $$`)
  await db.query('create trigger fail_expiry before insert on credit_ledger for each row execute function pg_temp.fail_expiry()')
  const failed = await expirePass()
  expect(failed).toMatchObject({ expired: 0, taken: 0, overdue: 1 })
  expect(failed.failed).toHaveLength(1)
  await db.query('drop trigger fail_expiry on credit_ledger')
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 10000, overdue: 0, failed: [] })
  expect(await freeOf(db, owner)).toBe(0)
  expect(await row(db, "select has_function_privilege('authenticated','public.partner_promo_expire_run()','execute') u, has_function_privilege('service_role','public.partner_promo_expire_run()','execute') s"))
    .toEqual({ u: false, s: true })
})
