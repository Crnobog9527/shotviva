import { readFileSync } from 'node:fs'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { available, bind, commission, dispute, promoter, refund, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

let db: Client
let f: Awaited<ReturnType<typeof setupAffiliate>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => { await db.query('begin'); f = await setupAffiliate(db) })
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

it('binds only the first eligible touch; existing payments, self, unknown and inactive slugs refuse', async () => {
  const other = await promoter(db)
  expect(await bind(db, f.buyer, other.slug)).toBe(false)
  expect(await bind(db, other.id, other.slug)).toBe(false)
  const user = await createUser(db)
  expect(await bind(db, user, 'missing')).toBe(false)
  await db.query("update affiliates set status='suspended' where user_id=$1", [other.id])
  expect(await bind(db, user, other.slug)).toBe(false)
  const payment = await sale(db, user, 'pack_m', 2490)
  expect(await commission(db, payment.id)).toBeUndefined()
  expect(await bind(db, user, f.owner.slug, 'first_checkout')).toBe(false)
  expect(await bind(db, await createUser(db), f.owner.slug, 'first_checkout')).toBe(true)
  await db.query("update affiliates set status='suspended' where user_id=$1", [f.owner.id])
  const suspended = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(db, suspended.id)).toMatchObject({ status: 'void', void_reason: 'affiliate_inactive', amount: 0 })
})

it('example 10: $187.20 carries to the next period, $235.10 reserves once, a hold reserves across months until released and paid', async () => {
  const adjust = (cents: number) => db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,$2,'fixture')", [f.owner.id, cents])
  const daily = (day: string) => db.query('select affiliate_daily($1)', [day])
  const payouts = async () => (await db.query('select id,amount::int as cents,status,payout_snapshot from affiliate_payouts where affiliate_user_id=$1 order by period', [f.owner.id])).rows
  await adjust(18720)
  await daily('2030-12-01')
  expect(await payouts()).toHaveLength(0)
  await adjust(4790)
  await daily('2031-01-01')
  expect(await payouts()).toHaveLength(0)
  await db.query("update affiliates set payout_method='wise',payout_details='test' where user_id=$1", [f.owner.id])
  await daily('2031-01-02')
  expect(await payouts()).toHaveLength(0)
  await daily('2031-02-01')
  await daily('2031-02-01')
  const [payout] = await payouts()
  expect(await payouts()).toHaveLength(1)
  expect(payout).toMatchObject({ cents: 23510, status: 'due', payout_snapshot: { payout_method: 'wise' } })
  expect(await available(db, f.owner.id)).toBe(0)
  const decide = (input: object) => db.query('select admin_affiliate_payout_decide($1,$2)', [f.actor, input])
  await decide({ payout_id: payout.id, status: 'held', note: 'check destination' })
  expect(await available(db, f.owner.id)).toBe(0)
  await daily('2031-02-01')
  expect(await payouts()).toHaveLength(1)
  await daily('2031-03-01')
  expect(await payouts()).toHaveLength(1)
  await decide({ payout_id: payout.id, status: 'due' })
  await decide({ payout_id: payout.id, status: 'paid', method: 'wise', paid_at: '2031-03-01', paid_reference: 'local-fixture' })
  expect(await available(db, f.owner.id)).toBe(0)
})

it('confirms later earnings daily and carries them to the next month after a successful empty settlement', async () => {
  await db.query("update affiliates set payout_method='paypal',payout_details='qa' where user_id=$1", [f.owner.id])
  const p = await sale(db, f.buyer, 'pro_yearly', 250000)
  await db.query("update affiliate_commissions set confirm_after='2031-12-03T00:00:00Z' where payment_id=$1", [p.id])
  await db.query("select affiliate_daily('2031-12-01')")
  expect((await commission(db, p.id)).status).toBe('pending')
  await db.query("select affiliate_daily('2031-12-03')")
  expect(await available(db, f.owner.id)).toBe(25000)
  expect(await row(db, 'select period from affiliate_payouts where affiliate_user_id=$1', [f.owner.id])).toBeUndefined()
  await db.query("select affiliate_daily('2032-01-01')")
  expect(await available(db, f.owner.id)).toBe(0)
  expect(await row(db, 'select period::text from affiliate_payouts where affiliate_user_id=$1', [f.owner.id])).toEqual({ period: '2032-01-01' })
})

it('recognizes a completed historical month from another affiliate’s payout and catches up an unmarked month once', async () => {
  const legacy = await promoter(db)
  await db.query(`insert into affiliate_payouts(affiliate_user_id,period,amount,payout_snapshot)
    values($1,'2039-01-01',50,'{}')`, [legacy.id])
  const migration = readFileSync('supabase/migrations/1042_affiliate_settlement_catchup.sql', 'utf8')
  const backfill = migration.match(/insert into public\.affiliate_settlement_runs\(period\)\s+select distinct[^;]+;/i)![0]
  await db.query(backfill)
  await db.query("update affiliates set payout_method='wise' where user_id=$1", [f.owner.id])
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,22000,'fixture')", [f.owner.id])
  await db.query("select affiliate_daily('2039-01-02')")
  const periods = async () => (await db.query('select period::text from affiliate_payouts where affiliate_user_id=$1', [f.owner.id])).rows
  expect(await periods()).toEqual([])
  await db.query("select affiliate_daily('2039-02-02')")
  await db.query("select affiliate_daily('2039-02-03')")
  expect(await periods()).toEqual([{ period: '2039-02-01' }])
})

it('example 11: same-IP commissions stay frozen until release; an open dispute still blocks confirmation', async () => {
  await db.query("update profiles set signup_ip='192.0.2.1' where id=any($1::uuid[])", [[f.owner.id, f.buyer]])
  const p = await sale(db, f.buyer, 'pack_m', 2490)
  const held = await commission(db, p.id)
  expect(held).toMatchObject({ status: 'on_hold', flags: ['same_ip'] })
  await db.query("select affiliate_daily('2033-01-01')")
  expect((await commission(db, p.id)).status).toBe('on_hold')
  await db.query('select admin_affiliate_commission_release($1,$2)', [f.actor, { commission_id: held.id, decision: 'release', reason: 'verified' }])
  expect((await commission(db, p.id)).status).toBe('pending')
  await dispute(db, p.charge, 2490)
  await db.query("select affiliate_daily('2033-01-01')")
  expect((await commission(db, p.id)).status).toBe('on_hold')
})

it('rejects self and transitive parent cycles', async () => {
  const member = await promoter(db, f.owner.id)
  for (const parent of [f.owner.id, member.id]) {
    await db.query('savepoint before_cycle')
    await expect(db.query('select admin_affiliate_set($1,$2)', [f.actor, { user_id: f.owner.id, parent_user_id: parent }])).rejects.toThrow("AFFILIATE_PARENT_CYCLE")
    await db.query('rollback to before_cycle')
    expect((await row(db, 'select parent_user_id from affiliates where user_id=$1', [f.owner.id])).parent_user_id).toBeNull()
  }
})

it('when closed, refunds and lost disputes still debit old commissions and new sales never earn', async () => {
  await db.query('update affiliate_settings set hold_days=0')
  const original = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await available(db, f.owner.id)).toBe(373)
  await db.query('update affiliate_settings set enabled=false')
  expect(await bind(db, await createUser(db), f.owner.slug)).toBe(false)
  await refund(db, original.charge, 1245)
  expect(await available(db, f.owner.id)).toBe(186)
  const d = await dispute(db, original.charge, 1245)
  await db.query("select close_payment_dispute($1,'lost')", [d])
  expect(await commission(db, original.id)).toMatchObject({ status: 'void', void_reason: 'dispute_lost', amount: 0 })
  expect(await available(db, f.owner.id)).toBe(0)

  const p = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(db, p.id)).toBeUndefined()
  await db.query('update affiliate_settings set enabled=true')
  await refund(db, p.charge, 10)
  await db.query('select affiliate_recompute_payment($1)', [p.id])
  expect(await commission(db, p.id)).toBeUndefined()
})

it.each(['suspended', 'banned'])('a %s promoter and their eligible parent earn nothing from that sale', async (status) => {
  const parent = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [parent.id])
  await db.query('update affiliates set status=$2,parent_user_id=$3 where user_id=$1', [f.owner.id, status, parent.id])
  const p = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'affiliate_inactive' })
  expect(await commission(db, p.id, 2)).toBeUndefined()
  await db.query("update affiliates set status='active' where user_id=$1", [f.owner.id])
  await refund(db, p.charge, 10)
  expect((await commission(db, p.id)).amount).toBe(0)
  expect(await commission(db, p.id, 2)).toBeUndefined()
})

it('honors a disabled settlement day when the program is enabled later that month', async () => {
  await db.query("update affiliates set payout_method='wise' where user_id=$1", [f.owner.id])
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,25000,'fixture')", [f.owner.id])
  await db.query('update affiliate_settings set enabled=false')
  await db.query("select affiliate_daily('2034-06-01')")
  await db.query('update affiliate_settings set enabled=true')
  await db.query("select affiliate_daily('2034-06-08')")
  expect(await available(db, f.owner.id)).toBe(25000)
  await db.query("select affiliate_daily('2034-07-01')")
  expect(await available(db, f.owner.id)).toBe(0)
})
