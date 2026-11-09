import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { StripeApi } from '../stripe/client'
import { readCheckoutFacts } from './facts'

const USER = '11111111-1111-4111-8111-111111111111'

type Row = Record<string, unknown> | null

// A payments table that records the filters asked of it and answers one row (or none).
// `row` answers payments; `mirror` answers subscriptions (the Waffo renewal date, T50).
function fakeDb(row: Row, mirror: Row = null) {
  const calls: unknown[][] = []
  let table = ''
  const query = {
    select: (...args: unknown[]) => (calls.push(['select', ...args]), query),
    eq: (...args: unknown[]) => (calls.push(['eq', ...args]), query),
    gte: (...args: unknown[]) => (calls.push(['gte', ...args]), query),
    order: (...args: unknown[]) => (calls.push(['order', ...args]), query),
    limit: (...args: unknown[]) => (calls.push(['limit', ...args]), query),
    in: () => query,
    returns: async () => ({ data: [{ idempotency_key: 'purchase:PAY_first', delta: 135 }], error: null }),
    maybeSingle: async () => ({ data: table === 'subscriptions' ? mirror : row, error: null }),
  }
  const db = { from: (name: string) => ((table = name), calls.push(['from', name]), query) } as unknown as SupabaseClient
  return { db, calls }
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_abc12345',
    status: 'complete',
    mode: 'subscription',
    amount_total: 4990,
    currency: 'usd',
    metadata: { user_id: USER, product_id: 'pro_monthly', method: 'card', locale: 'en' },
    subscription: { cancel_at_period_end: false, items: { data: [{ current_period_end: 1796515200 }] } },
    ...overrides,
  }
}

function fakeStripe(s: unknown, charge: unknown = { receipt_url: 'https://pay.stripe.com/receipts/r1', payment_method_details: { card: { brand: 'visa', last4: '4242' } } }) {
  const retrieve = vi.fn(async () => s)
  const charges = vi.fn(async () => {
    if (charge instanceof Error) throw charge
    return charge
  })
  return { stripe: { checkout: { sessions: { retrieve } }, charges: { retrieve: charges } } as unknown as StripeApi, retrieve, charges }
}

const row = { amount_total: 4990, currency: 'usd', method: 'card', stripe_charge_id: 'ch_123' }
const stripeQuery = { channel: 'stripe', sessionId: 'cs_test_abc12345' } as const

describe('checkout return facts (read only)', () => {
  it('settled: the payments row, the card and Stripe’s hosted receipt, the renewal date', async () => {
    const { stripe, retrieve, charges } = fakeStripe(session())
    const { db, calls } = fakeDb(row)
    const facts = await readCheckoutFacts({ stripe, db }, USER, stripeQuery)
    expect(facts).toEqual({
      productId: 'pro_monthly',
      settled: true,
      grantedCredits: null,
      abandoned: false,
      method: 'card',
      amount: { minor: 4990, currency: 'usd' },
      card: { brand: 'visa', last4: '4242' },
      receiptUrl: 'https://pay.stripe.com/receipts/r1',
      recurring: true,
      renewsAt: new Date(1796515200 * 1000).toISOString(),
      paymentKey: 'cs_test_abc12345',
    })
    expect(retrieve).toHaveBeenCalledWith('cs_test_abc12345', { expand: ['subscription'] })
    expect(charges).toHaveBeenCalledWith('ch_123')
    expect(calls).toContainEqual(['eq', 'user_id', USER])
    expect(calls).toContainEqual(['eq', 'stripe_session_id', 'cs_test_abc12345'])
  })

  it("someone else's session, or an unknown one, reads as not found", async () => {
    const other = fakeStripe(session({ metadata: { user_id: 'someone-else', product_id: 'pro_monthly' } }))
    expect(await readCheckoutFacts({ stripe: other.stripe, db: fakeDb(row).db }, USER, stripeQuery)).toBeNull()
    const missing = Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' })
    const gone = { checkout: { sessions: { retrieve: vi.fn(async () => Promise.reject(missing)) } } } as unknown as StripeApi
    expect(await readCheckoutFacts({ stripe: gone, db: fakeDb(row).db }, USER, stripeQuery)).toBeNull()
  })

  it('a session left without paying is abandoned (back to /pricing)', async () => {
    const { stripe } = fakeStripe(session({ status: 'open' }))
    expect(await readCheckoutFacts({ stripe, db: fakeDb(null).db }, USER, stripeQuery)).toMatchObject({ abandoned: true, settled: false })
  })

  it('paid but no payments row yet: pending, with the session amount and method', async () => {
    const { stripe, charges } = fakeStripe(session({ mode: 'payment', subscription: null, metadata: { user_id: USER, product_id: 'pack_m', method: 'alipay' }, amount_total: 2490 }))
    const facts = await readCheckoutFacts({ stripe, db: fakeDb(null).db }, USER, stripeQuery)
    expect(facts).toMatchObject({ productId: 'pack_m', settled: false, method: 'alipay', amount: { minor: 2490, currency: 'usd' }, recurring: false, renewsAt: null })
    expect(charges).not.toHaveBeenCalled()
  })

  it('a charge Stripe cannot return still leaves the purchase settled, without a receipt', async () => {
    const { stripe } = fakeStripe(session(), new Error('timeout'))
    expect(await readCheckoutFacts({ stripe, db: fakeDb(row).db }, USER, stripeQuery)).toMatchObject({ settled: true, receiptUrl: null, card: null })
  })

})

describe('checkout return facts, Waffo', () => {
  it('Waffo: this buyer’s recent payment of that product, newest first', async () => {
    const { stripe } = fakeStripe(null)
    const { db, calls } = fakeDb({ amount_total: 4990, currency: 'usd', method: 'alipay', stripe_charge_id: null })
    const facts = await readCheckoutFacts({ stripe, db }, USER, { channel: 'waffo', productId: 'pro_monthly' })
    expect(facts).toMatchObject({ settled: true, method: 'alipay', receiptUrl: null, recurring: false, renewsAt: null })
    expect(calls).toContainEqual(['eq', 'channel', 'waffo'])
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(await readCheckoutFacts({ stripe, db: fakeDb(null).db }, USER, { channel: 'waffo', productId: 'pack_s' })).toMatchObject({ settled: false })
  })

  it('Waffo card membership: a subscription, with the next renewal from the mirror (T50)', async () => {
    const { stripe } = fakeStripe(null)
    const payment = { amount_total: 4990, currency: 'usd', method: 'card', stripe_charge_id: null, waffo_order_id: 'ORD_sub1', waffo_payment_id: 'PAY_first' }
    const mirror = { current_period_end: '2026-12-06T00:00:00+00:00', cancel_at_period_end: false, status: 'active' }
    const { db, calls } = fakeDb(payment, mirror)
    const facts = await readCheckoutFacts({ stripe, db }, USER, { channel: 'waffo', productId: 'pro_monthly' })
    expect(facts).toMatchObject({ settled: true, grantedCredits: 135, recurring: true, renewsAt: '2026-12-06T00:00:00.000Z', paymentKey: 'PAY_first' })
    expect(calls).toContainEqual(['eq', 'waffo_order_id', 'ORD_sub1'])
    // activated not in yet: still a subscription, date unknown.
    const early = await readCheckoutFacts({ stripe, db: fakeDb(payment, null).db }, USER, { channel: 'waffo', productId: 'pro_monthly' })
    expect(early).toMatchObject({ recurring: true, renewsAt: null })
  })
})
