import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { promoter, refund, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin } from './helpers'

let db: Client
let fixture: Awaited<ReturnType<typeof setupAffiliate>>

beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  fixture = await setupAffiliate(db)
  const parent = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [parent.id])
  await db.query('update affiliates set parent_user_id=$2 where user_id=$1', [fixture.owner.id, parent.id])
  await db.query("update profiles set referred_at='2024-01-31 04:00:00Z' where id=$1", [fixture.buyer])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function settings(input: Record<string, number | null>) {
  await db.query('select admin_affiliate_settings($1,$2::jsonb)', [fixture.actor, JSON.stringify(input)])
}
async function amounts(payment: string) {
  const result = await db.query('select amount::int amount from affiliate_commissions where payment_id=$1 order by level', [payment])
  return result.rows.map((entry) => entry.amount)
}
async function paymentAt(timestamp: string): Promise<string> {
  return (await row(db, `insert into payments(user_id,product_id,channel,stripe_session_id,amount_total,currency,method,created_at)
    values($1,'pack_m','stripe',$2,2000,'usd','card',$3) returning id`, [fixture.buyer, 'cs_' + randomUUID(), timestamp])).id
}

it('includes the last instant of the UTC calendar month for both levels, including a leap day', async () => {
  await db.query("set local timezone='America/Los_Angeles'")
  await settings({ commission_months: 1 })
  expect(await amounts(await paymentAt('2024-02-29 04:00:00Z'))).toEqual([300, 100])
  const expired = await paymentAt('2024-02-29 04:00:00.000001Z')
  expect(await amounts(expired)).toEqual([])
  const errors = await row(db, 'select count(*)::int n from affiliate_recompute_errors where payment_id=$1', [expired])
  expect(errors.n).toBe(0)
  await settings({ commission_months: 2147483647 })
  expect(await amounts(await paymentAt('2026-06-01 00:00:00Z'))).toEqual([300, 100])
})

it('uses lifetime by default, audits changing or clearing the term, and preserves earlier eligibility', async () => {
  const term = () => row(db, 'select commission_months from affiliate_settings where singleton')
  expect((await term()).commission_months).toBeNull()
  const original = await sale(db, fixture.buyer, 'pack_m', 2000)
  expect(await amounts(original.id)).toEqual([300, 100])

  await settings({ commission_months: 1 })
  await settings({ hold_days: 30 }) // Settings clients predating the term omit this field.
  expect((await term()).commission_months).toBe(1)
  await refund(db, original.charge, 1000)
  expect(await amounts(original.id)).toEqual([150, 50])
  const expired = await sale(db, fixture.buyer, 'pack_m', 2000)
  expect(await amounts(expired.id)).toEqual([])

  await settings({ commission_months: null })
  expect((await term()).commission_months).toBeNull()
  await refund(db, expired.charge, 1000)
  expect(await amounts(expired.id)).toEqual([])
  expect(await amounts((await sale(db, fixture.buyer, 'pack_m', 2000)).id)).toEqual([300, 100])
  const audit = await db.query(`select reason::jsonb->'commission_months' as term from admin_audit_log
    where user_id=$1 and action='affiliate_settings' and reason::jsonb ? 'commission_months' order by id`, [fixture.actor])
  expect(audit.rows).toEqual([{ term: 1 }, { term: null }])
})
