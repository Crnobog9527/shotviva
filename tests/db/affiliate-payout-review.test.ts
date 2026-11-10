import { readFileSync } from 'node:fs'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { available, commission, dispute, refund, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin } from './helpers'

let db: Client, f: Awaited<ReturnType<typeof setupAffiliate>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  f = await setupAffiliate(db)
  await db.query('update affiliate_settings set hold_days=0,payout_min_usd=1,settlement_day=5')
  await db.query("update affiliates set payout_method='wise' where user_id=$1", [f.owner.id])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const run = (day: string) => db.query('select affiliate_daily($1)', [day])
const makeSale = () => sale(db, f.buyer, 'pack_m', 10000)
const payouts = async () => (await db.query(`select id,status,amount::int,paid_amount::int,
  affiliate_payout_payable(p)::int payable from affiliate_payouts p where affiliate_user_id=$1 order by period`, [f.owner.id])).rows
const decide = (id: string, status: string, extra = {}) => db.query('select admin_affiliate_payout_decide($1,$2)', [
  f.actor, { payout_id: id, status, method: 'wise', paid_at: '2031-06-10', paid_reference: 'T100', ...extra },
])
async function refuses(action: () => Promise<unknown>, code: string) {
  await db.query('savepoint refused')
  await expect(action()).rejects.toThrow(code)
  await db.query('rollback to refused')
}

it('catches up only once after day 5; new earnings cannot hide a linked refund or stale review', async () => {
  const first = await makeSale()
  await run('2031-06-04')
  expect(await payouts()).toHaveLength(0)
  await run('2031-06-07')
  await run('2031-06-10')
  const [p] = await payouts()
  expect(await payouts()).toHaveLength(1)
  await makeSale()
  await refund(db, first.charge, 1000)
  expect((await payouts())[0]).toMatchObject({ amount: 1500, payable: 1350 })
  await refuses(() => decide(p.id, 'paid'), 'AFFILIATE_PAYOUT_AMOUNT_CHANGED')
  await refund(db, first.charge, 2000)
  await refuses(() => decide(p.id, 'paid', { expected_amount: 1350 }), 'AFFILIATE_PAYOUT_AMOUNT_CHANGED')
  await decide(p.id, 'paid', { expected_amount: 1200 })
  expect((await payouts())[0]).toMatchObject({ amount: 1500, paid_amount: 1200, status: 'paid' })
  expect(await available(db, f.owner.id)).toBe(1500)
})

it('charges a full refund only to its own payout even when the older one is held', async () => {
  await makeSale()
  await run('2031-06-05')
  const [first] = await payouts()
  await decide(first.id, 'held', { note: 'verify address' })
  const secondSale = await makeSale()
  await run('2031-07-05')
  const [, second] = await payouts()
  await refund(db, secondSale.charge, 10000)
  expect((await payouts()).map(p => p.payable)).toEqual([1500, 0])
  await decide(first.id, 'due')
  await decide(first.id, 'paid')
  await decide(second.id, 'paid', { expected_amount: 0 })
  expect(await available(db, f.owner.id)).toBe(0)
})

it.each(['return', 'forfeit'])('void mode %s requires a note, affects only the backing and records the choice', async (mode) => {
  const original = await makeSale()
  await run('2031-06-05')
  const [p] = await payouts()
  const other = await makeSale()
  await decide(p.id, 'held', { note: 'check' })
  await refuses(() => decide(p.id, 'void', { void_mode: mode }), 'INVALID_INPUT')
  await refuses(() => decide(p.id, 'void', { note: 'authorized' }), 'INVALID_INPUT')
  await decide(p.id, 'void', { void_mode: mode, note: 'authorized' })
  await db.query('select affiliate_recompute_payment($1)', [original.id])
  expect((await commission(db, original.id)).status).toBe(mode === 'return' ? 'confirmed' : 'void')
  expect((await commission(db, other.id)).amount).toBe(1500)
  expect(await available(db, f.owner.id)).toBe(mode === 'return' ? 3000 : 1500)
  expect(await row(db, "select reason from admin_audit_log where action='affiliate_payout_decide' and target_id=$1 and reason like '%authorized%'", [p.id]))
    .toEqual({ reason: 'held -> void: ' + mode + ': authorized' })
  await run('2031-06-06')
  expect(await payouts()).toHaveLength(1)
  await run('2031-07-06')
  expect((await payouts())[1].payable).toBe(mode === 'return' ? 3000 : 1500)
})

it('will not pay an unrecomputed refund; winning a dispute after paying zero restores a traceable new payout', async () => {
  const sale = await makeSale()
  await run('2031-06-05')
  const [p] = await payouts()
  await db.query('alter table affiliate_commissions add constraint t100_failure check(false) not valid')
  await refund(db, sale.charge, 5000)
  await refuses(() => decide(p.id, 'paid'), 'AFFILIATE_PAYOUT_RECOMPUTE_PENDING')
  await db.query('alter table affiliate_commissions drop constraint t100_failure')
  await db.query('select affiliate_recompute_payment($1)', [sale.id])
  const d = await dispute(db, sale.charge, 5000)
  expect((await payouts())[0].payable).toBe(0)
  await decide(p.id, 'paid', { expected_amount: 0 })
  await db.query("select close_payment_dispute($1,'won')", [d])
  await run('2031-07-07')
  expect((await payouts())[1]).toMatchObject({ amount: 750, payable: 750 })
  await refund(db, sale.charge, 10000)
  expect((await payouts())[1].payable).toBe(0)
})

it('upgrades duplicate legacy held reservations without paying twice or forfeiting already paid earnings', async () => {
  await makeSale()
  const ids = (await db.query(`insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot)
    values($1,'2029-01-01',1500,'held','{}'),($1,'2029-02-01',1500,'paid','{}') returning id`, [f.owner.id])).rows
  const migration = readFileSync('supabase/migrations/1041_affiliate_payout_review.sql', 'utf8')
  const replay = migration.match(/do \$\$[\s\S]+?end \$\$;/i)![0]
  await db.query(replay)
  await makeSale()
  expect((await payouts())[0].payable).toBeNull()
  await refuses(() => decide(ids[0].id, 'void', { void_mode: 'forfeit', note: 'unknown' }), 'AFFILIATE_PAYOUT_LEGACY_REVIEW')
  await decide(ids[0].id, 'due')
  await refuses(() => decide(ids[0].id, 'paid'), 'AFFILIATE_PAYOUT_LEGACY_REVIEW')
  await decide(ids[0].id, 'held', { note: 'duplicate' })
  await decide(ids[0].id, 'void', { void_mode: 'return', note: 'already paid' })
  expect(await available(db, f.owner.id)).toBe(1500)
})
