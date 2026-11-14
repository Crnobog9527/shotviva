import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadGrowthStats, type GrowthStats } from '@/core/admin/growth'

import { promoter } from './affiliate-fixtures'
import { anonClient, connectAdmin, createUser, localSupabase, retryAuth } from './helpers'
import { serviceSupabase } from './supabase-env'

// admin_growth_stats (1180, ARCHITECTURE §16.2b): one fixture per number on the page. The periods
// are two Beijing weeks in March 2021, so rows other test files write today cannot fall inside.
// Current: 8–14 March, previous: 1–7 March (Beijing). Every user is named for what they prove.
// The fixture is written and read inside one transaction that is rolled back, so the file can run
// again on the same database and leaves nothing behind for other files.

const CURRENT = { start: '2021-03-07T16:00:00.000Z', end: '2021-03-14T16:00:00.000Z' }
const PREVIOUS = { start: '2021-02-28T16:00:00.000Z', end: '2021-03-07T16:00:00.000Z' }
const window = { range: '7d' as const, start: CURRENT.start, end: CURRENT.end, prevStart: PREVIOUS.start, prevEnd: PREVIOUS.end }
const at = (iso: string) => new Date(iso)

let db: Client
let stats: GrowthStats
let taxed: GrowthStats
let revenueDelta: { purchases: number; revenue: number }
const ids: Record<string, string> = {}

async function user(name: string, signedAt: string, role: 'user' | 'admin' = 'user') {
  const id = await createUser(db)
  await db.query('update public.profiles set created_at = $2, role = $3 where id = $1', [id, at(signedAt), role])
  ids[name] = id
  return id
}

async function job(userId: string, status: 'succeeded' | 'failed', createdAt: string) {
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, error_code, created_at, finished_at)
     values ($1, $2, 'image', 'freeform', '{"resolution":"1k"}', 'test/model', 'web', $3, 'public', 2, 'free', $4, $5, $6, $6)`,
    [randomUUID(), userId, status, status === 'succeeded' ? 'outputs/x.png' : null, status === 'failed' ? 'PROVIDER_FAILED' : null, at(createdAt)],
  )
}

type Pay = {
  product: string
  createdAt: string
  total: number
  tax?: number
  refunded?: number
  currency?: string
  session?: boolean
  waffoOrder?: string
}

async function pay(userId: string, p: Pay): Promise<{ id: number; charge: string | null }> {
  const short = randomUUID().replaceAll('-', '').slice(0, 16)
  const waffo = p.waffoOrder !== undefined
  const charge = waffo ? null : `ch_${short}`
  const { rows } = await db.query<{ id: number }>(
    `insert into public.payments
       (user_id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id, waffo_order_id, waffo_payment_id,
        amount_total, amount_tax, amount_refunded, currency, method, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'card', $13, $14) returning id`,
    [
      userId,
      p.product,
      waffo ? 'waffo' : 'stripe',
      !waffo && p.session !== false ? `cs_test_${short}` : null,
      !waffo && p.session === false ? `in_${short}` : null,
      charge,
      waffo ? p.waffoOrder : null,
      waffo ? `PAY_${short}` : null,
      p.total,
      p.tax ?? 0,
      p.refunded ?? 0,
      p.currency ?? 'usd',
      p.refunded ? 'partially_refunded' : 'paid',
      at(p.createdAt),
    ],
  )
  return { id: rows[0]!.id, charge }
}

async function dispute(charge: string, amount: number, createdAt: string) {
  const id = `dp_${randomUUID().replaceAll('-', '')}`
  await db.query("select public.open_payment_dispute($1, $2, $3, 'usd', 'fraudulent', now(), false)", [id, charge, amount])
  await db.query('update public.payment_disputes set created_at = $2 where stripe_dispute_id = $1', [id, at(createdAt)])
}

beforeAll(async () => {
  db = await connectAdmin()
  await db.query('begin')
  try {
    await writeFixture()
  } finally {
    await db.query('rollback')
  }
}, 120_000)

async function writeFixture() {
  // An admin who does everything inside the current week: left out of every number.
  const admin = await user('admin', '2021-03-08T02:00:00Z', 'admin')
  await job(admin, 'succeeded', '2021-03-08T03:00:00Z')
  const adminPay = await pay(admin, { product: 'pack_s', createdAt: '2021-03-08T04:00:00Z', total: 990, refunded: 990 })
  await dispute(adminPay.charge!, 990, '2021-03-09T01:00:00Z')

  // New this week, got an image and bought a pack on Stripe: a first order.
  const imagedBuyer = await user('imagedBuyer', '2021-03-08T05:00:00Z')
  await job(imagedBuyer, 'succeeded', '2021-03-08T06:00:00Z')
  await pay(imagedBuyer, { product: 'pack_s', createdAt: '2021-03-08T07:00:00Z', total: 990 })

  // New this week, only a failed image: signs up, never reaches the first image.
  const failedOnly = await user('failedOnly', '2021-03-09T05:00:00Z')
  await job(failedOnly, 'failed', '2021-03-09T06:00:00Z')

  // New this week through a promoter link, buys a plan on Waffo (tax on top).
  const affiliate = await promoter(db)
  const referred = await user('referred', '2021-03-10T05:00:00Z')
  await db.query("update public.profiles set referred_by = $2, referred_at = $3, referred_source = 'signup' where id = $1", [
    referred,
    affiliate.id,
    at('2021-03-10T05:00:00Z'),
  ])
  await job(referred, 'succeeded', '2021-03-10T06:00:00Z')
  await pay(referred, { product: 'starter_monthly', createdAt: '2021-03-10T07:00:00Z', total: 1990, tax: 100, waffoOrder: `wf-${randomUUID()}` })

  // Signed up last week (new then): image and first pack last week. This week: back for an image,
  // a Stripe renewal partly refunded and disputed, and a repeat pack paid in euros.
  const lastWeek = await user('lastWeek', '2021-03-03T05:00:00Z')
  await job(lastWeek, 'succeeded', '2021-03-03T06:00:00Z')
  // Refunded in part later on: the refund belongs to last week's order, not to this week.
  await pay(lastWeek, { product: 'pack_m', createdAt: '2021-03-03T07:00:00Z', total: 2490, refunded: 500 })
  await job(lastWeek, 'succeeded', '2021-03-11T06:00:00Z')
  const renewal = await pay(lastWeek, { product: 'pro_monthly', createdAt: '2021-03-11T07:00:00Z', total: 4990, refunded: 1000, session: false })
  await dispute(renewal.charge!, 3990, '2021-03-12T01:00:00Z')
  await pay(lastWeek, { product: 'pack_s', createdAt: '2021-03-12T07:00:00Z', total: 1500, currency: 'eur' })

  // Signed up in February: Waffo plan bought last week, renewed this week on the same order.
  const longAgo = await user('longAgo', '2021-02-01T05:00:00Z')
  const order = `wf-${randomUUID()}`
  await pay(longAgo, { product: 'starter_monthly', createdAt: '2021-03-04T07:00:00Z', total: 1990, waffoOrder: order })
  await pay(longAgo, { product: 'starter_monthly', createdAt: '2021-03-13T07:00:00Z', total: 1990, waffoOrder: order })

  // On the boundary: signed up at the very end of the current week, so in neither period.
  await user('boundary', CURRENT.end)

  const { rows } = await db.query<{ s: unknown }>('select public.admin_growth_stats($1, $2, $3, $4) as s', [
    CURRENT.start,
    CURRENT.end,
    PREVIOUS.start,
    PREVIOUS.end,
  ])
  stats = await loadGrowthStats({ rpc: async () => ({ data: rows[0]!.s, error: null }) }, window)
  taxed = await taxFixture()
  revenueDelta = await revenueOfRefundedTaxedOrder()
}

// April 2021, its own window: a refund gives back its share of the tax (control review of #482).
const APRIL = { start: '2021-04-04T16:00:00.000Z', end: '2021-04-11T16:00:00.000Z', prevStart: '2021-03-28T16:00:00.000Z', prevEnd: '2021-04-04T16:00:00.000Z' }
async function taxFixture(): Promise<GrowthStats> {
  const buyer = await user('taxBuyer', '2021-04-05T01:00:00Z')
  await pay(buyer, { product: 'pack_s', createdAt: '2021-04-05T02:00:00Z', total: 1100, tax: 100, refunded: 1100 })
  await pay(buyer, { product: 'pack_m', createdAt: '2021-04-06T02:00:00Z', total: 2200, tax: 200, refunded: 1100 })
  await pay(buyer, { product: 'pack_s', createdAt: '2021-04-07T02:00:00Z', total: 990 })
  const { rows } = await db.query<{ s: unknown }>('select public.admin_growth_stats($1, $2, $3, $4) as s', [APRIL.start, APRIL.end, APRIL.prevStart, APRIL.prevEnd])
  return loadGrowthStats({ rpc: async () => ({ data: rows[0]!.s, error: null }) }, { range: '7d', ...APRIL })
}

// admin_revenue_stats (1181) uses the same formula: a fully refunded taxed order adds an order and no money.
async function revenueOfRefundedTaxedOrder() {
  const read = async () => {
    const { rows } = await db.query<{ p: number; r: string }>(
      "select (w->>'purchases')::int as p, (w->>'revenue_usd') as r from jsonb_array_elements(public.admin_revenue_stats(7)->'windows') w where w->>'key' = 'period'",
    )
    return { purchases: rows[0]!.p, revenue: Number(rows[0]!.r) }
  }
  const before = await read()
  const buyer = await user('refundedNow', new Date().toISOString())
  await pay(buyer, { product: 'pack_s', createdAt: new Date().toISOString(), total: 1100, tax: 100, refunded: 1100 })
  const after = await read()
  return { purchases: after.purchases - before.purchases, revenue: after.revenue - before.revenue }
}

afterAll(async () => {
  await db.end()
})

describe('admin_growth_stats: people', () => {
  it('counts sign-ups in the period, admins and the end boundary left out', () => {
    expect(stats.periods.current.signups).toBe(3)
    expect([...stats.periods.current.cohort].sort()).toEqual([ids.imagedBuyer, ids.failedOnly, ids.referred].sort())
    expect(stats.periods.previous.signups).toBe(1)
    expect(stats.periods.previous.cohort).toEqual([ids.lastWeek])
  })

  it('follows new users to their first successful image and their first payment', () => {
    expect(stats.periods.current.new_users).toEqual({ first_image: 2, paid: 2 })
    expect(stats.periods.previous.new_users).toEqual({ first_image: 1, paid: 1 })
  })

  it('counts returning users who came back for an image or paid', () => {
    expect(stats.periods.current.returning).toEqual({ active: 1, paid: 2 })
    expect(stats.periods.previous.returning).toEqual({ active: 0, paid: 1 })
    expect(stats.periods.current.payers).toBe(4)
  })

  it('returns every admin id so the PostHog half can leave their visits out', () => {
    expect(stats.admin_ids).toContain(ids.admin)
    expect(stats.admin_ids).not.toContain(ids.imagedBuyer)
  })
})

describe('admin_growth_stats: money', () => {
  it('splits orders into first, repeat and renewal (Stripe invoice-only, Waffo same order)', () => {
    expect(stats.periods.current.orders).toEqual({ total: 5, first: 2, repeat: 1, renewal: 2, non_usd: 1 })
    expect(stats.periods.previous.orders).toEqual({ total: 2, first: 2, repeat: 0, renewal: 0, non_usd: 0 })
  })

  it('sums net revenue after tax and refunds, USD only', () => {
    // 9.90 + (19.90 − 1.00) + (49.90 − 10.00) + 19.90; the euro pack adds nothing.
    expect(stats.periods.current.money).toEqual({ net_usd: 88.6, tax_usd: 1, refunded_usd: 10 })
    expect(stats.periods.current.by_kind).toEqual({ first: 28.8, repeat: 0, renewal: 59.8 })
    // 24.90 − 5.00 refunded + 19.90.
    expect(stats.periods.previous.money.net_usd).toBe(39.8)
  })

  it('splits plans from packs and Stripe from Waffo', () => {
    expect(stats.periods.current.by_type).toEqual({ plan: { orders: 3, net_usd: 78.7 }, pack: { orders: 2, net_usd: 9.9 } })
    expect(stats.periods.current.by_channel).toEqual({ stripe: { orders: 3, net_usd: 49.8 }, waffo: { orders: 2, net_usd: 38.8 } })
  })

  it('counts refunds on the period\'s orders and disputes when opened, admins left out', () => {
    expect(stats.periods.current.refunds).toEqual({ count: 1, usd: 10 })
    expect(stats.periods.previous.refunds).toEqual({ count: 1, usd: 5 })
    expect(stats.periods.current.disputes).toEqual({ count: 1, usd: 39.9 })
  })

  it('credits the promoter link with its sign-up, its buyer and their money', () => {
    expect(stats.periods.current.affiliate).toEqual({ signups: 1, payers: 1, net_usd: 18.9 })
    expect(stats.periods.current.cohort_referred).toEqual([ids.referred])
  })

  it('lists each buyer once with their net total, for source attribution', () => {
    const lastWeek = stats.periods.current.buyers.find((b) => b.user_id === ids.lastWeek)
    expect(lastWeek).toEqual({ user_id: ids.lastWeek, net_usd: 39.9, orders: 2, referred: false })
    expect(stats.periods.current.buyers.find((b) => b.user_id === ids.referred)?.referred).toBe(true)
    expect(stats.periods.current.buyers).toHaveLength(4)
  })
})

describe('refunds give back their share of the tax', () => {
  it('nets a fully refunded taxed order at 0 and a half refunded one at half its pre-tax amount', () => {
    // 1100 incl. 100 tax, fully refunded: 0. 2200 incl. 200 tax, 1100 refunded: 10.00. 9.90 untaxed.
    expect(taxed.periods.current.money).toEqual({ net_usd: 19.9, tax_usd: 1, refunded_usd: 20 })
    expect(taxed.periods.current.refunds).toEqual({ count: 2, usd: 20 })
    expect(taxed.periods.current.by_type.pack).toEqual({ orders: 3, net_usd: 19.9 })
  })

  it('moves admin_revenue_stats to the same formula', () => {
    expect(revenueDelta.purchases).toBe(1)
    expect(revenueDelta.revenue).toBeCloseTo(0, 6)
  })
})

describe('admin_growth_stats: guard rails', () => {
  const call = (start: string, end: string, prevStart: string, prevEnd: string) =>
    db.query('select public.admin_growth_stats($1, $2, $3, $4)', [start, end, prevStart, prevEnd])

  it('refuses periods out of order, longer than 31 days or in the future', async () => {
    await expect(call(CURRENT.end, CURRENT.start, PREVIOUS.start, PREVIOUS.end)).rejects.toThrow(/INVALID_INPUT/)
    await expect(call(CURRENT.start, CURRENT.end, PREVIOUS.start, CURRENT.end)).rejects.toThrow(/INVALID_INPUT/)
    await expect(call('2021-01-01T00:00:00Z', '2021-03-01T00:00:00Z', '2020-11-01T00:00:00Z', '2021-01-01T00:00:00Z')).rejects.toThrow(/INVALID_INPUT/)
    await expect(call('2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z', '2098-12-31T00:00:00Z', '2099-01-01T00:00:00Z')).rejects.toThrow(/INVALID_INPUT/)
  })

  it('is closed to browser keys', async () => {
    const { error } = await anonClient().rpc('admin_growth_stats', {
      p_start: CURRENT.start,
      p_end: CURRENT.end,
      p_prev_start: PREVIOUS.start,
      p_prev_end: PREVIOUS.end,
    })
    expect(error).not.toBeNull()
  })

  it('is closed to a signed-in user who is not the service', async () => {
    const email = `growth-${randomUUID()}@example.test`
    const password = `pw-${randomUUID()}`
    await retryAuth(async () => {
      const { error } = await serviceSupabase().auth.admin.createUser({ email, password, email_confirm: true })
      if (error) throw error
    })
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    await retryAuth(async () => {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw error
    })
    const { data, error } = await client.rpc('admin_growth_stats', {
      p_start: CURRENT.start,
      p_end: CURRENT.end,
      p_prev_start: PREVIOUS.start,
      p_prev_end: PREVIOUS.end,
    })
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
  }, 60_000)
})
