import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { commissionCents } from '@/core/affiliate/compute'
import { available, bind, commission, dispute, promoter, refund, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

let db: Client
let fixture: Awaited<ReturnType<typeof setupAffiliate>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  fixture = await setupAffiliate(db)
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

it('examples 1–3 and 8: monthly, tax, pack, annual, renewals and an upgrade use integer cents', async () => {
  const cases = [
    ['starter_monthly', 1990, 0, 1500, 298], ['pro_yearly', 47900, 0, 1000, 4790],
    ['pack_m', 2490, 0, 1500, 373], ['pro_monthly', 5489, 499, 1500, 748],
  ] as const
  for (const [product, total, tax, rate, expected] of cases) {
    const payment = await sale(db, fixture.buyer, product, total, tax)
    expect(commissionCents(total, tax, 0, rate)).toBe(expected)
    expect(await commission(db, payment.id)).toMatchObject({ amount: expected, status: 'pending', rate_bp: rate })
  }
  for (let month = 1; month < 12; month++) {
    await db.query("select apply_subscription_renewal($1,'pro_monthly',$2,now()+interval '1 month',5489,'usd',499,'card',null)", [fixture.buyer, 'in_' + month])
  }
  await db.query("select apply_subscription_renewal($1,'pro_yearly','in_annual',now()+interval '1 year',47900,'usd',0,'card',null)", [fixture.buyer])
  const totals = await db.query('select product_id,sum(amount)::int as cents from affiliate_commissions where affiliate_user_id=$1 group by product_id', [fixture.owner.id])
  expect(totals.rows).toEqual(expect.arrayContaining([{ product_id: 'pro_monthly', cents: 8976 }, { product_id: 'pro_yearly', cents: 9580 }, { product_id: 'starter_monthly', cents: 298 }]))
})

it('examples 4–7: refunds, replays and dispute outcomes recompute the original payment and rate', async () => {
  const p = await sale(db, fixture.buyer, 'max_monthly', 9900)
  expect((await commission(db, p.id)).amount).toBe(1485)
  await db.query("update affiliate_rates set l1_bp=10 where product_kind='monthly'")
  await refund(db, p.charge, 4950)
  expect((await commission(db, p.id)).amount).toBe(commissionCents(9900, 0, 4950, 1500))
  const history = () => row(db, 'select count(*)::int as n,max(reason) filter(where reason=\'partial_refund\') as reason from affiliate_commission_changes where commission_id=$1', [commissionId])
  const commissionId = (await commission(db, p.id)).id
  const before = await history()
  await refund(db, p.charge, 4950)
  expect(await history()).toEqual(before)
  expect(before.reason).toBe('partial_refund')
  const d = await dispute(db, p.charge, 4950)
  expect(await commission(db, p.id)).toMatchObject({ status: 'on_hold', amount: 742 })
  await db.query("select close_payment_dispute($1,'won')", [d])
  expect(await commission(db, p.id)).toMatchObject({ status: 'pending', amount: 742 })
  const lost = await dispute(db, p.charge, 4950)
  await db.query("select close_payment_dispute($1,'lost')", [lost])
  expect(await commission(db, p.id)).toMatchObject({ status: 'void', amount: 0, void_reason: 'dispute_lost' })
  const other = await sale(db, fixture.buyer, 'pack_m', 2490)
  await refund(db, other.charge, 2490)
  expect(await commission(db, other.id)).toMatchObject({ status: 'void', amount: 0, void_reason: 'refunded' })
})

it('example 5: a refund after confirmation and payout leaves minus $7.43', async () => {
  await db.query('update affiliate_settings set hold_days=0')
  const p = await sale(db, fixture.buyer, 'max_monthly', 9900)
  expect(await available(db, fixture.owner.id)).toBe(1485)
  await db.query("insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot,paid_at) values($1,current_date,1485,'paid','{}',now())", [fixture.owner.id])
  await refund(db, p.charge, 4950)
  expect(await commission(db, p.id)).toMatchObject({ status: 'confirmed', amount: 742 })
  expect(await available(db, fixture.owner.id)).toBe(-743)
})

it('example 9: two recipients, never three; team eligibility is frozen at purchase', async () => {
  const grand = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [grand.id])
  await db.query('update affiliates set team_enabled=true,parent_user_id=$2 where user_id=$1', [fixture.owner.id, grand.id])
  const member = await promoter(db, fixture.owner.id)
  const customer = await createUser(db)
  await bind(db, customer, member.slug)
  const p = await sale(db, customer, 'max_yearly', 71300)
  expect((await commission(db, p.id)).amount).toBe(7130)
  expect((await commission(db, p.id, 2)).amount).toBe(commissionCents(71300, 0, 0, 300))
  expect((await commission(db, p.id, 2)).amount).toBe(2139)
  expect(await commission(db, p.id, 3)).toBeUndefined()
  await db.query('update affiliates set team_enabled=false where user_id=$1', [fixture.owner.id])
  const next = await sale(db, customer, 'max_yearly', 71300)
  expect(await commission(db, next.id, 2)).toBeUndefined()
  await db.query('update affiliates set team_enabled=true where user_id=$1', [fixture.owner.id])
  await refund(db, next.charge, 10)
  expect(await commission(db, next.id, 2)).toBeUndefined()
})
