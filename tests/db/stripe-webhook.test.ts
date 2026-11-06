import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { handleStripeWebhook } from '@/core/billing/stripe'

import { serviceSupabase } from './supabase-env'

import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf } from './helpers'
import { checkoutSession, eventFor, paymentsOf, signed, stripeHarness, subscriptionObject } from './stripe-fixtures'

// AGENTS §7 test 2 (Stripe, first payment): duplicate and out-of-order events, bad signature,
// one grant per Checkout Session. Real local Supabase, real signature checks.

let db: Client
let h: ReturnType<typeof stripeHarness>

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
})

const COMPLETED = 'checkout.session.completed'
const ASYNC_OK = 'checkout.session.async_payment_succeeded'
const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS

function stage(session: ReturnType<typeof checkoutSession>) {
  h.sessions.set(session.id, session)
  return session
}

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))

async function mirrorOf(userId: string) {
  const { rows } = await db.query(
    'select stripe_subscription_id, product_id, status, current_period_end, cancel_at_period_end from public.subscriptions where user_id = $1',
    [userId],
  )
  return rows
}

describe('signature', () => {
  it('rejects a bad signature with 400 and applies nothing', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_s', method: 'card' }))
    const event = eventFor(COMPLETED, session.id)

    const forged = signed(event, 'whsec_someone_else')
    expect((await handleStripeWebhook(h.deps, forged)).status).toBe(400)
    const tampered = { ...signed(event), body: JSON.stringify({ ...event, id: 'evt_other' }) }
    expect((await handleStripeWebhook(h.deps, tampered)).status).toBe(400)
    expect((await handleStripeWebhook(h.deps, { body: JSON.stringify(event), signature: null })).status).toBe(400)

    expect(h.retrieve).not.toHaveBeenCalled()
    expect(await ledgerOf(db, userId)).toEqual([])
  })
})

describe('checkout.session.completed', () => {
  it('a card subscription grants the first period and mirrors the subscription', async () => {
    const userId = await createUser(db, { freeCredits: 6 })
    const subscription = subscriptionObject({ periodEndDays: 30 })
    const session = stage(checkoutSession({ userId, productId: 'starter_monthly', method: 'card', subscription }))

    const result = await deliver(eventFor(COMPLETED, session.id))

    expect(result).toEqual({ status: 200, body: { received: true, outcome: 'applied' } })
    const profile = await profileOf(db, userId)
    expect(profile).toMatchObject({ credits: 50, free_credits: 6 })
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(30, 2)
    expect(await mirrorOf(userId)).toEqual([
      expect.objectContaining({ stripe_subscription_id: subscription.id, product_id: 'starter_monthly', status: 'active', cancel_at_period_end: false }),
    ])
    expect(h.trackBuy).toHaveBeenCalledTimes(1)
    expect(h.trackBuy).toHaveBeenCalledWith(userId, {
      product_id: 'starter_monthly',
      tier: 'starter',
      interval: 'month',
      form: 'subscription',
      channel: 'stripe',
      method: 'card',
      amount_usd: 19.9,
      credits: 50,
    })
  })

  it('the same event delivered three times grants once and tracks once', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pro_yearly', method: 'card', subscription: subscriptionObject({ periodEndDays: 365 }) }))
    const event = eventFor(COMPLETED, session.id)

    const outcomes = []
    for (let i = 0; i < 3; i += 1) outcomes.push((await deliver(event)).body.outcome)

    expect(outcomes).toEqual(['applied', 'replayed', 'replayed'])
    expect((await profileOf(db, userId)).credits).toBe(1620)
    expect(await ledgerOf(db, userId)).toEqual([
      { kind: 'purchase', pool: 'paid', delta: 1620, idempotency_key: `purchase:${session.id}` },
    ])
    expect(await mirrorOf(userId)).toHaveLength(1)
    // T10: one payments row per settled session, however often it is delivered.
    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ stripe_session_id: session.id, amount_total: 47900 })])
    expect(h.trackBuy).toHaveBeenCalledTimes(1)
  })

  it('different events for one session (async success first, then completed) grant once', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_m', method: 'alipay' }))

    expect((await deliver(eventFor(ASYNC_OK, session.id))).body.outcome).toBe('applied')
    expect((await deliver(eventFor(COMPLETED, session.id))).body.outcome).toBe('replayed')
    expect((await profileOf(db, userId)).credits).toBe(55)
  })

  it('out of order across sessions: each session grants once and memberships stack', async () => {
    const userId = await createUser(db)
    const first = stage(checkoutSession({ userId, productId: 'starter_monthly', method: 'alipay' }))
    const second = stage(checkoutSession({ userId, productId: 'starter_monthly', method: 'alipay' }))
    const firstEvent = eventFor(COMPLETED, first.id)

    await deliver(eventFor(COMPLETED, second.id))
    await deliver(firstEvent)
    await deliver(firstEvent)

    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(100)
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(60, 2)
    expect(await ledgerOf(db, userId)).toHaveLength(2)
  })

  it('a late, older event writes the current subscription state, never an older one', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30 })
    const session = stage(checkoutSession({ userId, productId: 'max_monthly', method: 'card', subscription }))
    const event = eventFor(COMPLETED, session.id)
    await deliver(event)

    // Meanwhile the buyer cancelled in the portal; the original event is redelivered late.
    stage({ ...session, subscription: { ...subscription, cancel_at_period_end: true } })
    await deliver(event)

    expect(await mirrorOf(userId)).toEqual([expect.objectContaining({ cancel_at_period_end: true })])
    expect((await profileOf(db, userId)).credits).toBe(280)
  })

  it('Alipay buys one period: +30 days, no subscription row', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'starter_monthly', method: 'alipay' }))
    await deliver(eventFor(COMPLETED, session.id))
    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(50)
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(30, 2)
    expect(await mirrorOf(userId)).toEqual([])
    expect(h.trackBuy).toHaveBeenCalledWith(userId, expect.objectContaining({ form: 'one_time', method: 'alipay' }))
  })

  it('a pack adds paid credits and leaves paid_until alone', async () => {
    const paidUntil = new Date(Date.now() + 5 * DAY_MS)
    const userId = await createUser(db, { paidUntil })
    const session = stage(checkoutSession({ userId, productId: 'pack_s', method: 'card' }))
    await deliver(eventFor(COMPLETED, session.id))
    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(20)
    expect(profile.paid_until?.getTime()).toBe(paidUntil.getTime())
  })

  it('an unpaid session grants nothing until its async success arrives', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_l', method: 'alipay', paymentStatus: 'unpaid' }))
    expect((await deliver(eventFor(COMPLETED, session.id))).body.outcome).toBe('unpaid')
    expect((await profileOf(db, userId)).credits).toBe(0)

    stage({ ...session, payment_status: 'paid' })
    expect((await deliver(eventFor(ASYNC_OK, session.id))).body.outcome).toBe('applied')
    expect((await profileOf(db, userId)).credits).toBe(115)
  })
})

describe('refusals and failures', () => {
  it('refuses a session whose charged Price is another product (500, nothing granted)', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_l', method: 'card', priceProductId: 'pack_s' }))
    expect((await deliver(eventFor(COMPLETED, session.id))).status).toBe(500)
    expect(await ledgerOf(db, userId)).toEqual([])
  })

  it('refuses a session whose client_reference_id is not the metadata user', async () => {
    const userId = await createUser(db)
    const other = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_s', method: 'card', clientReferenceId: other }))
    expect((await deliver(eventFor(COMPLETED, session.id))).status).toBe(500)
    expect(await ledgerOf(db, userId)).toEqual([])
    expect(await ledgerOf(db, other)).toEqual([])
  })

  it('answers 500 on a temporary failure so Stripe retries, and the retry grants once', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_s', method: 'card' }))
    const event = eventFor(COMPLETED, session.id)
    h.retrieve.mockRejectedValueOnce(new Error('stripe unavailable'))

    expect((await deliver(event)).status).toBe(500)
    expect((await deliver(event)).body.outcome).toBe('applied')
    expect((await profileOf(db, userId)).credits).toBe(20)
  })

  it('ignores events it does not handle', async () => {
    const result = await deliver(eventFor('payment_intent.created', 'pi_1'))
    expect(result).toEqual({ status: 200, body: { received: true } })
    expect(h.retrieve).not.toHaveBeenCalled()
  })
})

describe('settle_checkout', () => {
  it('refuses a subscription id already mirrored for another user, granting nothing', async () => {
    const owner = await createUser(db)
    const intruder = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30 })
    const first = stage(checkoutSession({ userId: owner, productId: 'pro_monthly', method: 'card', subscription }))
    await deliver(eventFor(COMPLETED, first.id))

    const second = stage(checkoutSession({ userId: intruder, productId: 'pro_monthly', method: 'card', subscription }))
    expect((await deliver(eventFor(COMPLETED, second.id))).status).toBe(500)
    expect(await ledgerOf(db, intruder)).toEqual([])
    expect(await mirrorOf(owner)).toHaveLength(1)
  })

  it('is the only writer: the service role cannot write subscriptions directly', async () => {
    const userId = await createUser(db)
    const { error } = await serviceSupabase().from('subscriptions').insert({
      stripe_subscription_id: 'sub_direct',
      user_id: userId,
      product_id: 'starter_monthly',
      status: 'active',
      current_period_end: new Date().toISOString(),
    })
    expect(error?.message).toMatch(/permission denied/)
  })
})
