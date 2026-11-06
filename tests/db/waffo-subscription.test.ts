import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelWaffoSubscription, handleWaffoWebhook, type WaffoWebhookDeps } from '@/core/billing/waffo'
import { site } from '@/site/site.config'

import { WAFFO_STORE, paymentId, signWaffo, subscriptionPaid, subscriptionState, waffoKeys } from '../fakes/waffo'
import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T50 (ARCHITECTURE §6.3, LAUNCH §5 Waffo line): a Waffo card subscription. Every successful
// charge grants once through apply_purchase (keyed by PAY_…, one payments row per charge); a
// failed renewal grants nothing; the mirror follows subscription.* events in order and a
// cancel ends it at period end. Real local Supabase, real signatures.

let db: Client
let deps: WaffoWebhookDeps
const keys = waffoKeys()

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  deps = { db: serviceSupabase(), products: site.billing.products, publicKey: keys.publicKey, storeId: WAFFO_STORE, mode: 'test', trackBuy: vi.fn() }
})

const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS
const orderId = () => `ORD_${Math.random().toString(36).slice(2, 14)}`

function deliver(event: unknown) {
  const body = JSON.stringify(event)
  return handleWaffoWebhook(deps, { body, signature: signWaffo(body, keys.privateKey) })
}

async function mirrorOf(order: string) {
  const { rows } = await db.query(
    'select provider, user_id, product_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id from public.subscriptions where waffo_order_id = $1',
    [order],
  )
  return rows[0] ?? null
}

async function chargesOf(userId: string) {
  const { rows } = await db.query('select waffo_order_id, waffo_payment_id, method from public.payments where user_id = $1 order by id', [userId])
  return rows
}

describe('Waffo card subscription: charges', () => {
  it('first payment and a renewal each grant once (credits and paid_until like Stripe); redelivery grants nothing', async () => {
    const userId = await createUser(db, { freeCredits: 6 })
    const order = orderId()
    const first = subscriptionPaid({ userId, productId: 'starter_monthly', orderId: order, eventId: paymentId(), periodNumber: 1 })
    const renewal = subscriptionPaid({ userId, productId: 'starter_monthly', orderId: order, eventId: paymentId(), periodNumber: 2 })

    expect((await deliver(first)).body.outcome).toBe('applied')
    expect((await deliver(first)).body.outcome).toBe('replayed')
    expect((await deliver(renewal)).body.outcome).toBe('applied')
    expect((await deliver(renewal)).body.outcome).toBe('replayed')

    const profile = await profileOf(db, userId)
    expect(profile).toMatchObject({ credits: 100, free_credits: 6 })
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(60, 2)
    expect(await ledgerOf(db, userId)).toEqual([
      { kind: 'purchase', pool: 'paid', delta: 50, idempotency_key: `purchase:${first.eventId}` },
      { kind: 'purchase', pool: 'paid', delta: 50, idempotency_key: `purchase:${renewal.eventId}` },
    ])
    // One payments row per charge on the same order.
    expect(await chargesOf(userId)).toEqual([
      { waffo_order_id: order, waffo_payment_id: first.eventId, method: 'card' },
      { waffo_order_id: order, waffo_payment_id: renewal.eventId, method: 'card' },
    ])
  })

  it('a failed renewal (past_due) grants nothing and leaves paid_until where it was', async () => {
    const userId = await createUser(db)
    const order = orderId()
    await deliver(subscriptionPaid({ userId, productId: 'pro_monthly', orderId: order }))
    await deliver(subscriptionState({ userId, productId: 'pro_monthly', orderId: order, eventType: 'subscription.activated', orderStatus: 'active', currentPeriodEnd: '2026-12-06', timestamp: '2026-11-06T10:00:00.000Z' }))
    const before = await profileOf(db, userId)

    const failed = subscriptionState({ userId, productId: 'pro_monthly', orderId: order, eventType: 'subscription.past_due', orderStatus: 'past_due', timestamp: '2026-12-06T08:31:00.000Z' })
    expect((await deliver(failed)).status).toBe(200)

    expect(await profileOf(db, userId)).toEqual(before)
    expect(await ledgerOf(db, userId)).toHaveLength(1)
    expect(await mirrorOf(order)).toMatchObject({ status: 'past_due', cancel_at_period_end: false })
  })
})

describe('Waffo card subscription: mirror', () => {
  it('activated creates the waffo row; renewed moves the period; an older event changes nothing; canceled is final', async () => {
    const userId = await createUser(db)
    const order = orderId()
    const state = (eventType: string, orderStatus: string, timestamp: string, currentPeriodEnd?: string) =>
      deliver(subscriptionState({ userId, productId: 'max_yearly', orderId: order, eventType, orderStatus, timestamp, currentPeriodEnd }))

    await state('subscription.activated', 'active', '2026-11-06T10:00:00.000Z', '2027-11-06')
    expect(await mirrorOf(order)).toMatchObject({ provider: 'waffo', user_id: userId, product_id: 'max_yearly', status: 'active', stripe_subscription_id: null })

    await state('subscription.renewed', 'active', '2027-11-06T10:00:00.000Z', '2028-11-06')
    expect((await mirrorOf(order)).current_period_end.toISOString()).toBe('2028-11-06T00:00:00.000Z')

    // A late canceling from before the renewal is older than what is mirrored.
    await state('subscription.canceling', 'canceling', '2027-01-01T00:00:00.000Z')
    expect(await mirrorOf(order)).toMatchObject({ status: 'active', cancel_at_period_end: false })

    await state('subscription.canceled', 'canceled', '2028-11-06T00:05:00.000Z')
    await state('subscription.uncanceled', 'active', '2028-11-07T00:00:00.000Z')
    expect(await mirrorOf(order)).toMatchObject({ status: 'canceled' })
  })

  it('refuses an order that belongs to another user', async () => {
    const owner = await createUser(db)
    const other = await createUser(db)
    const order = orderId()
    await deliver(subscriptionState({ userId: owner, productId: 'pro_monthly', orderId: order, eventType: 'subscription.activated', orderStatus: 'active', currentPeriodEnd: '2026-12-06' }))
    const forged = subscriptionState({ userId: other, productId: 'pro_monthly', orderId: order, eventType: 'subscription.renewed', orderStatus: 'active', currentPeriodEnd: '2027-01-06' })
    expect((await deliver(forged)).status).toBe(500)
    expect(await mirrorOf(order)).toMatchObject({ user_id: owner })
  })

  it('Cancel subscription: Waffo cancels at period end and the mirror says so at once', async () => {
    const userId = await createUser(db)
    const order = orderId()
    await deliver(subscriptionState({ userId, productId: 'pro_monthly', orderId: order, eventType: 'subscription.activated', orderStatus: 'active', currentPeriodEnd: '2026-12-06', timestamp: '2026-11-06T10:00:00.000Z' }))
    const cancelSubscription = vi.fn(async (id: string) => ({ orderId: id, status: 'canceling', currentPeriodEnd: '2026-12-06' }))

    expect(await cancelWaffoSubscription({ db: serviceSupabase(), waffo: { cancelSubscription } }, userId)).toBe('canceling')
    expect(cancelSubscription).toHaveBeenCalledWith(order)
    expect(await mirrorOf(order)).toMatchObject({ status: 'active', cancel_at_period_end: true })
    // Nothing left to cancel: a second press is refused before Waffo is called.
    await expect(cancelWaffoSubscription({ db: serviceSupabase(), waffo: { cancelSubscription } }, userId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(cancelSubscription).toHaveBeenCalledTimes(1)
  })
})
