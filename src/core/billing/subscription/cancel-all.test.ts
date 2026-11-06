import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

import type { StripeApi } from '../stripe/client'
import { cancelAllSubscriptions } from './cancel-all'

// ARCHITECTURE §13: before an account is deleted, every subscription Stripe may still bill is
// cancelled at once without proration; one that will not cancel stops the deletion.

type Row = {
  provider: 'stripe' | 'waffo'
  stripe_subscription_id: string | null
  waffo_order_id: string | null
  product_id: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
}

const waffoRow = (orderId: string, status: string, cancelAtPeriodEnd = false): Row => ({
  provider: 'waffo',
  stripe_subscription_id: null,
  waffo_order_id: orderId,
  product_id: 'pro_monthly',
  status,
  current_period_end: '2026-12-06T00:00:00Z',
  cancel_at_period_end: cancelAtPeriodEnd,
})
const noWaffo = () => ({ cancelSubscription: vi.fn(async () => Promise.reject(new Error('waffo not expected'))) })

const row = (id: string, status: string): Row => ({
  provider: 'stripe',
  stripe_subscription_id: id,
  waffo_order_id: null,
  product_id: 'pro_monthly',
  status,
  current_period_end: '2026-12-06T00:00:00Z',
  cancel_at_period_end: false,
})

// The chain readMirrorRows uses: from().select().eq().limit().
function adminWith(rows: Row[]): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, limit: async () => ({ data: rows, error: null }) }
  return { from: () => chain } as unknown as SupabaseClient
}

// A Stripe fake with the subscriptions slice: `statuses` is what Stripe holds, `failing` ids
// refuse to cancel.
function stripeFake(statuses: Record<string, Stripe.Subscription.Status>, failing: string[] = []) {
  const cancel = vi.fn(async (id: string) => {
    if (failing.includes(id)) throw new Error('stripe unavailable')
    statuses[id] = 'canceled'
    return { id, status: 'canceled' } as Stripe.Subscription
  })
  const retrieve = vi.fn(async (id: string) => {
    if (id === 'sub_unreachable') throw new Error('network down')
    if (!statuses[id]) throw Object.assign(new Error(`No such subscription: ${id}`), { statusCode: 404 })
    return { id, status: statuses[id] } as Stripe.Subscription
  })
  const api = { subscriptions: { cancel, retrieve } } as unknown as Pick<StripeApi, 'subscriptions'>
  return { api, cancel, retrieve, statuses }
}

describe('cancelAllSubscriptions', () => {
  it('cancels every live subscription at once, without proration', async () => {
    const stripe = stripeFake({ sub_a: 'active', sub_b: 'past_due' })
    const count = await cancelAllSubscriptions({ admin: adminWith([row('sub_a', 'active'), row('sub_b', 'past_due')]), stripe: () => stripe.api, waffo: noWaffo }, 'u1')
    expect(count).toBe(2)
    expect(stripe.cancel.mock.calls).toEqual([
      ['sub_a', { prorate: false, invoice_now: false }],
      ['sub_b', { prorate: false, invoice_now: false }],
    ])
    expect(stripe.statuses).toEqual({ sub_a: 'canceled', sub_b: 'canceled' })
  })

  it('skips subscriptions that already ended and never builds a Stripe client for none', async () => {
    const factory = vi.fn()
    const rows = [row('sub_old', 'canceled'), row('sub_never', 'incomplete_expired')]
    expect(await cancelAllSubscriptions({ admin: adminWith(rows), stripe: factory, waffo: noWaffo }, 'u1')).toBe(0)
    expect(await cancelAllSubscriptions({ admin: adminWith([]), stripe: factory, waffo: noWaffo }, 'u1')).toBe(0)
    expect(factory).not.toHaveBeenCalled()
  })

  it('treats a subscription Stripe already cancelled (mirror behind) as done', async () => {
    const stripe = stripeFake({ sub_a: 'canceled' }, ['sub_a'])
    await expect(cancelAllSubscriptions({ admin: adminWith([row('sub_a', 'active')]), stripe: () => stripe.api, waffo: noWaffo }, 'u1')).resolves.toBe(1)
    expect(stripe.retrieve).toHaveBeenCalledWith('sub_a')
  })

  it('throws SUBSCRIPTION_CANCEL_FAILED when Stripe will not cancel a live one', async () => {
    const stripe = stripeFake({ sub_a: 'active', sub_b: 'active' }, ['sub_a'])
    const run = cancelAllSubscriptions({ admin: adminWith([row('sub_a', 'active'), row('sub_b', 'active')]), stripe: () => stripe.api, waffo: noWaffo }, 'u1')
    await expect(run).rejects.toMatchObject({ code: 'SUBSCRIPTION_CANCEL_FAILED', status: 502 })
    // Stops at the first failure.
    expect(stripe.cancel).toHaveBeenCalledTimes(1)
  })

  it('treats a subscription Stripe does not have (404) as nothing left to bill', async () => {
    const stripe = stripeFake({}, ['sub_gone'])
    await expect(cancelAllSubscriptions({ admin: adminWith([row('sub_gone', 'active')]), stripe: () => stripe.api, waffo: noWaffo }, 'u1')).resolves.toBe(1)
  })

  it('stops when Stripe cannot even be asked what state it is in', async () => {
    const stripe = stripeFake({}, ['sub_unreachable'])
    await expect(cancelAllSubscriptions({ admin: adminWith([row('sub_unreachable', 'active')]), stripe: () => stripe.api, waffo: noWaffo }, 'u1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_CANCEL_FAILED',
    })
  })

  it('cancels a Waffo card subscription through cancel-order, and skips one already cancelling (T50)', async () => {
    const stripe = stripeFake({ sub_a: 'active' })
    const cancelSubscription = vi.fn(async (orderId: string) => ({ orderId, status: 'canceling' }))
    const rows = [row('sub_a', 'active'), waffoRow('ORD_live', 'active'), waffoRow('ORD_going', 'active', true), waffoRow('ORD_done', 'canceled')]
    expect(await cancelAllSubscriptions({ admin: adminWith(rows), stripe: () => stripe.api, waffo: () => ({ cancelSubscription }) }, 'u1')).toBe(2)
    expect(cancelSubscription.mock.calls.map((call) => call[0])).toEqual(['ORD_live'])
    expect(stripe.cancel).toHaveBeenCalledTimes(1)
  })

  it('stops the deletion when Waffo refuses the cancel', async () => {
    const cancelSubscription = vi.fn(async () => Promise.reject(new Error('waffo 500')))
    await expect(cancelAllSubscriptions({ admin: adminWith([waffoRow('ORD_live', 'past_due')]), stripe: () => stripeFake({}).api, waffo: () => ({ cancelSubscription }) }, 'u1')).rejects.toMatchObject({ code: 'SUBSCRIPTION_CANCEL_FAILED' })
  })
})
