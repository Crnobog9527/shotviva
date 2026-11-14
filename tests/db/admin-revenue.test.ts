import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listPurchases, loadRevenueStats, type RevenueStats } from '@/core/admin'

import { connectAdmin, retryAuth } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// admin_revenue_stats (source: payments since 0168; since 1181 a refund returns its share of the tax) against direct SQL in one
// repeatable-read snapshot, and the purchase list through the real T9 settle path.

let db: Client
let buyer: string
let renewalInvoice: string
const service = serviceSupabase()

beforeAll(async () => {
  db = await connectAdmin()
  // Through Auth, not a bare auth.users insert: the list reads the email back from GoTrue.
  buyer = await retryAuth(async () => {
    const { data, error } = await service.auth.admin.createUser({ email: `t23-buyer-${randomUUID()}@example.test`, email_confirm: true })
    if (error || !data.user) throw error ?? new Error('createUser failed')
    return data.user.id
  })
  // Real settle paths: Stripe checkout (cs_) and a Waffo-style event id.
  await db.query("select public.apply_purchase($1, 'pack_s', $2)", [buyer, `cs_test_${randomUUID().slice(0, 8)}`])
  await db.query("select public.apply_purchase($1, 'starter_monthly', $2)", [buyer, `waffo-${randomUUID().slice(0, 8)}`])
  // T10: payments rows come from settle_checkout (first payment / one-off) and
  // apply_subscription_renewal (renewals), as the webhook writes them.
  const id = randomUUID().replaceAll('-', '').slice(0, 16)
  await db.query(
    `select public.settle_checkout($1, 'pack_m', $2, p_amount_total => 2490, p_currency => 'usd', p_amount_tax => 0,
       p_method => 'alipay', p_charge_id => $3)`,
    [buyer, `cs_test_${id}`, `py_${id}`],
  )
  renewalInvoice = `in_${id}`
  await db.query(
    `select public.apply_subscription_renewal($1, 'pro_monthly', $2, now() + interval '30 days', 5427, 'usd', 437, 'card', $3)`,
    [buyer, renewalInvoice, `ch_${id}`],
  )
  await db.query("select public.record_payment_issue($1, 'refunded', 1000)", [`ch_${id}`])
  // Rows no T10 function writes yet: a Waffo payment (T13) and a non-USD one. Inserted as the
  // database owner, test data only.
  await db.query(
    `insert into public.payments (user_id, product_id, channel, waffo_order_id, waffo_payment_id, stripe_session_id, amount_total, currency, method)
     values ($1, 'starter_monthly', 'waffo', $2, $4, null, 1990, 'usd', 'card'),
            ($1, 'pack_s', 'stripe', null, null, $3, 1500, 'eur', 'card')`,
    [buyer, `wf-${id}`, `cs_test_eur_${id}`, `PAY_${id.replace(/[^A-Za-z0-9]/g, '')}`],
  )
}, 120_000)

afterAll(async () => {
  await db.end()
})

const DIRECT = `
  with b as (select date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai' as today),
  w as (
    select 'today' as key, today as since from b
    union all select '7d', today - interval '6 days' from b
    union all select 'period', today - interval '29 days' from b
  )
  select w.key,
    (select count(*) from public.payments where created_at >= w.since)::int as purchases,
    (select coalesce(sum(round((amount_total - amount_refunded)::numeric * (amount_total - amount_tax) / amount_total)), 0) / 100.0
      from public.payments where created_at >= w.since and currency = 'usd' and amount_total > 0)::numeric as revenue_usd
  from w`

async function snapshot(): Promise<{ stats: RevenueStats; direct: { key: string; purchases: number; revenue_usd: string }[] }> {
  await db.query('begin isolation level repeatable read')
  try {
    const { rows } = await db.query<{ s: unknown }>('select public.admin_revenue_stats(30) as s')
    const direct = (await db.query(DIRECT)).rows
    const stats = await loadRevenueStats({ rpc: async () => ({ data: rows[0]!.s, error: null }) }, 30)
    return { stats, direct }
  } finally {
    await db.query('commit')
  }
}

describe('admin_revenue_stats', () => {
  it('matches direct net sums over payments for today, 7 and 30 days', async () => {
    const { stats, direct } = await snapshot()
    for (const row of direct) {
      const window = stats.windows.find((w) => w.key === row.key)!
      expect(window.purchases).toBe(row.purchases)
      expect(window.revenue_usd).toBeCloseTo(Number(row.revenue_usd), 2)
    }
  })

  it('counts this buyer net of tax and refunds, and leaves the non-USD payment out of revenue', async () => {
    const { rows } = await db.query<{ net: string }>(
      "select sum(amount_total - amount_tax - amount_refunded) filter (where currency = 'usd') as net from public.payments where user_id = $1",
      [buyer],
    )
    // pack_m 2490 + pro_monthly (5427 − 437 tax − 1000 refunded) + Waffo 1990 = 8470 cents.
    expect(Number(rows[0]!.net)).toBe(8470)
  })

  it('splits by product and channel, and the trend adds up to the period', async () => {
    const { stats } = await snapshot()
    expect(stats.by_product).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_id: 'pack_m', channel: 'stripe' }),
        expect.objectContaining({ product_id: 'pro_monthly', channel: 'stripe' }),
        expect.objectContaining({ product_id: 'starter_monthly', channel: 'waffo' }),
      ]),
    )
    const period = stats.windows.find((w) => w.key === 'period')!
    expect(stats.trend).toHaveLength(30)
    expect(stats.trend.reduce((sum, day) => sum + day.revenue_usd, 0)).toBeCloseTo(period.revenue_usd, 2)
  })

  it('refuses a bad window and any client role', async () => {
    await expect(db.query('select public.admin_revenue_stats(100)')).rejects.toThrow(/INVALID_INPUT/)
    const { error } = await anonSupabase().rpc('admin_revenue_stats', { p_days: 30 })
    expect(error?.message).toMatch(/permission denied/)
  })
})

describe('purchase list (payments)', () => {
  it('lists payments newest first with what was charged, method, status and the buyer email', async () => {
    const page = await listPurchases(service)
    const mine = page.items.filter((row) => row.userId === buyer)
    expect(mine.map((row) => [row.productId, row.channel, row.form, row.method, row.status])).toEqual([
      ['pack_s', 'stripe', 'checkout', 'card', 'paid'],
      ['starter_monthly', 'waffo', 'waffo_subscription', 'card', 'paid'],
      ['pro_monthly', 'stripe', 'renewal', 'card', 'partially_refunded'],
      ['pack_m', 'stripe', 'checkout', 'alipay', 'paid'],
    ])
    expect(mine[1]).toMatchObject({ providerId: expect.stringMatching(/^wf-/) })
    expect(mine[0]).toMatchObject({ currency: 'eur', amountTotal: 1500 })
    expect(mine[2]).toMatchObject({ amountTotal: 5427, amountTax: 437, amountRefunded: 1000, currency: 'usd', providerId: expect.stringMatching(/^ch_/) })
    expect(mine[3]).toMatchObject({ amountTotal: 2490, amountTax: 0, providerId: expect.stringMatching(/^py_/) })
    expect(mine[0]?.email).toMatch(/@example\.test$/)
  })

  it('pages with the keyset cursor, without repeats', async () => {
    const first = await listPurchases(service)
    const ids = new Set(first.items.map((row) => row.id))
    if (!first.nextCursor) return
    const second = await listPurchases(service, first.nextCursor)
    expect(second.items.some((row) => ids.has(row.id))).toBe(false)
  })

  it('a renewal payment links its charge; the invoice is on the row', async () => {
    const { rows } = await db.query('select stripe_invoice_id, stripe_session_id from public.payments where stripe_invoice_id = $1', [renewalInvoice])
    expect(rows).toEqual([{ stripe_invoice_id: renewalInvoice, stripe_session_id: null }])
  })
})
