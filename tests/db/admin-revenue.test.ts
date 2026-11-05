import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listPurchases, loadRevenueStats, type RevenueStats } from '@/core/admin'

import { connectAdmin, retryAuth } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T23 PR B: admin_revenue_stats (Plan A: list price from the ledger) against direct SQL in one
// repeatable-read snapshot, and the purchase list through the real T9 settle path.

let db: Client
let buyer: string
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
    (select count(*) from public.credit_ledger where kind = 'purchase' and created_at >= w.since)::int as purchases,
    (select coalesce(sum(p.price_usd), 0) from public.credit_ledger l left join public.products p on p.id = l.product_id
      where l.kind = 'purchase' and l.created_at >= w.since)::numeric as revenue_usd
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
  it('matches direct list-price sums for today, 7 and 30 days', async () => {
    const { stats, direct } = await snapshot()
    for (const row of direct) {
      const window = stats.windows.find((w) => w.key === row.key)!
      expect(window.purchases).toBe(row.purchases)
      expect(window.revenue_usd).toBeCloseTo(Number(row.revenue_usd), 2)
    }
  })

  it('splits by product and channel, and the trend adds up to the period', async () => {
    const { stats } = await snapshot()
    expect(stats.by_product).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_id: 'pack_s', channel: 'stripe' }),
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

describe('purchase list', () => {
  it('lists purchases newest first with list price, channel and the buyer email', async () => {
    const page = await listPurchases(service)
    const mine = page.items.filter((row) => row.userId === buyer)
    expect(mine.map((row) => [row.productId, row.channel, row.form])).toEqual([
      ['starter_monthly', 'waffo', 'waffo'],
      ['pack_s', 'stripe', 'checkout'],
    ])
    expect(mine[1]?.listPriceUsd).toBe(9.9)
    expect(mine[0]?.email).toMatch(/@example\.test$/)
  })
})
