import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import {
  adminActor, confirm, fiveCustomers, freeOf, months, partner, refused, run, sheet, type Sheet,
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
  const granted = await freeOf(db, owner)

  // Every order is refunded after its sheet was confirmed: the whole 300,000 bonus is owed.
  for (const s of sales) await db.query("select record_payment_issue($1,'refunded',2490)", [s.charge])
  expect(await freeOf(db, owner)).toBe(granted) // credits already granted are never touched
  await run(db, m.current)
  const now = await sheet(db, orgId, m.current)
  expect(now).toMatchObject({ base: 10000, bonus: 0, clawback_owed: 300000, clawback_applied: 10000, total: 0 })
  expect(now.detail.sources).toEqual([{ grant_id: Number(last.id), period: m.previous, owed: 300000, applied: 10000 }])
  expect(await confirm(db, actor, now)).toMatchObject({ applied: true, total: 0 })
  expect(await freeOf(db, owner)).toBe(granted)
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
  // 3,000 spent (reserve 3,500, a failed job's 500 refunded) during the month.
  await db.query("select _apply_credit_change($1,'free','reserve',-3500,'job','t:r')", [owner])
  await db.query("select _apply_credit_change($1,'free','refund',500,'job','t:f')", [owner])
  await db.query("update credit_ledger set created_at=now()-interval '1 minute' where idempotency_key in ('t:r','t:f')")
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

it("grants to the owner's own free pool only: the org pool, held credits and org_allocate never see it", async () => {
  const { orgId, owner } = await partner(db, actor)
  const staff = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [staff, invite_token])
  await fiveCustomers(db, owner, 60000, m.in_previous)
  await run(db, m.current)
  await confirm(db, actor, await sheet(db, orgId, m.current))
  expect(await row(db, 'select pool_credits::int p from orgs where id=$1', [orgId])).toEqual({ p: 0 })
  expect(await row(db, 'select count(*)::int n from org_credit_ledger where org_id=$1', [orgId])).toEqual({ n: 0 })
  expect(await row(db, 'select credits,free_credits from profiles where id=$1', [owner])).toEqual({ credits: 0, free_credits: 40000 })
  await refused(db, () => db.query("select org_allocate($1,$2,40000,'promo-move')", [owner, staff]), 'ORG_POOL_INSUFFICIENT')
  expect(await row(db, 'select free_credits,credits from profiles where id=$1', [staff])).toEqual({ free_credits: 0, credits: 0 })
})
