import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { feeLineSchema, feeLineColumns, groupOrderFees, orderPaymentSchema, paymentColumns } from '@/core/affiliate/partners/order-fees'
import { row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin } from './helpers'

// F6: the columns the partner and admin fee views read exist, hold what the views expect, and the
// partner read exposes no provider reference. Each test runs in a rolled-back transaction.

let db: Client
let f: Awaited<ReturnType<typeof setupAffiliate>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  f = await setupAffiliate(db)
  await db.query("update payment_fee_settings set record_from='2000-01-01'")
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const record = async (input: Record<string, unknown>) => (await row(db, 'select payment_fee_record($1) as r', [input])).r

it('reads a payment with its current fee lines, the real bill replacing the estimate and refund fees kept', async () => {
  const p = await sale(db, f.buyer, 'pro_monthly', 5489, 499)
  await record({ payment_id: p.id, idempotency_key: `estimate:${p.id}`, lines: [{ kind: 'acquiring', source: 'estimate', amount_cents: 300 }] })
  await record({ payment_id: p.id, idempotency_key: `stripe_bt:${p.id}`, actual_cents: 320, lines: [{ kind: 'acquiring', source: 'stripe_bt' }] })
  await record({ payment_id: p.id, idempotency_key: `refund_fee:R1`, refund_id: 'R1', lines: [{ kind: 'refund_fee', source: 'estimate', amount_cents: 100 }] })

  const payments = (await db.query(`select ${paymentColumns} from payments where id = any($1)`, [[p.id]])).rows
  const lines = (await db.query(`select ${feeLineColumns} from payment_fee_lines where payment_id = any($1)`, [[p.id]])).rows
  const grouped = groupOrderFees(orderPaymentSchema.array().parse(payments), feeLineSchema.array().parse(lines))
  const order = grouped.get(String(p.id))!
  expect(order.payment).toMatchObject({ amount_total: 5489, amount_tax: 499, fee_status: 'estimated' })
  expect(order.lines.map((l) => [l.refund_id, l.revision, l.source, l.amount_cents])).toEqual([
    [null, 2, 'stripe_bt', 320],
    ['R1', 1, 'estimate', 100],
  ])
  // Partner reads never include provider references or idempotency keys.
  expect(Object.keys(lines[0] as object)).not.toContain('source_ref')
  expect(Object.keys(lines[0] as object)).not.toContain('idempotency_key')
})

it('lets the admin views read every revision, the schedules and the overview columns', async () => {
  const p = await sale(db, f.buyer, 'pro_monthly', 5489, 499)
  await record({ payment_id: p.id, idempotency_key: `estimate:${p.id}`, lines: [{ kind: 'acquiring', source: 'estimate', amount_cents: 300 }] })
  const all = await db.query(
    'select id,refund_id,revision,line_no,kind,rate_bp,fixed_cents,amount_cents,source,status,source_ref,note from payment_fee_lines where payment_id=$1', [p.id])
  expect(all.rowCount).toBe(1)
  const detail = await db.query('select id,created_at,channel,method,product_id,status,amount_total,amount_tax,amount_refunded,currency,fee_status,fee_cents from payments where id=$1', [p.id])
  expect(detail.rows[0]).toMatchObject({ fee_status: 'estimated', fee_cents: 300 })
  const commissions = await db.query('select id,level,rate_bp,amount,status,base_usd,fee_cents,net_base_usd from affiliate_commissions where payment_id=$1', [p.id])
  expect(commissions.rows[0]).toMatchObject({ fee_cents: '300', net_base_usd: '4690' })
  const schedules = await db.query('select id,channel,method,kind,rate_bp,fixed_cents,rounding,effective_from,active,note,updated_at from payment_fee_schedules limit 1')
  expect(schedules.rowCount).toBe(1)
  expect((await db.query('select record_from from payment_fee_settings')).rowCount).toBe(1)
})
