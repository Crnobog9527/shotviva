import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProductId } from '@/core/config'
import { handleStripeWebhook, priceCents } from '@/core/billing/stripe'
import { cancelRefundedSubscription } from '@/core/billing/subscription'
import { handleWaffoWebhook, type WaffoWebhookDeps } from '@/core/billing/waffo'
import { site } from '@/site/site.config'

import { WAFFO_STORE, orderCompleted, refundSucceeded, signWaffo, waffoKeys } from '../fakes/waffo'
import { connectAdmin, createUser, DAY_MS, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'
import { chargeObject, checkoutSession, eventFor, mirrorOf, signed, stripeHarness, subscriptionObject, type Harness } from './stripe-fixtures'

// T71 (ARCHITECTURE §6.2 「会员退款」, 「Waffo 退款与 Stripe 同一规则」): a refunded membership ends
// at once (paid_until = the refund time, never before the user's other still-valid memberships),
// its tier no longer counts, its renewing subscription is cancelled; Waffo refunds add up per
// refund event and take credits back by the same rule.

vi.mock('@/core/analytics/capture-error', () => ({ captureAlert: vi.fn(), captureError: vi.fn() }))

let db: Client
let h: Harness

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
  h.deps.cancelRefunded = (userId, target) =>
    cancelRefundedSubscription(
      {
        admin: serviceSupabase(),
        stripe: () => h.stripe,
        waffo: () => {
          throw new Error('no Waffo in this test')
        },
      },
      userId,
      target,
    )
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))
const cents = (productId: ProductId) => priceCents(site.billing.products.find((p) => p.id === productId)!)
const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS
const tierOf = async (userId: string) => (await db.query('select public.current_tier($1) as tier', [userId])).rows[0].tier

// A one-time membership period (Alipay), as the wallet line sells it.
async function buyPeriod(userId: string, productId: ProductId = 'starter_monthly') {
  const charge = chargeObject({ amount: cents(productId), method: 'alipay' })
  h.charges.set(charge.id, charge)
  const session = checkoutSession({ userId, productId, method: 'alipay', charge })
  h.sessions.set(session.id, session)
  await deliver(eventFor('checkout.session.completed', session.id))
  return { charge, session }
}

function refundAll(charge: Stripe.Charge) {
  h.charges.set(charge.id, { ...charge, amount_refunded: charge.amount, refunded: true })
  return eventFor('charge.refunded', charge.id)
}

// As if bought `ago` days earlier: its grant and payment dated back, its period (and paid_until)
// ending `until` days from now.
async function shift(userId: string, sessionId: string, ago: number, until: number) {
  const at = `now() - make_interval(days => ${ago})`
  const end = `now() + make_interval(days => ${until})`
  await db.query(`update public.credit_ledger set created_at = ${at}, paid_until_after = ${end} where idempotency_key = $1`, [`purchase:${sessionId}`])
  await db.query(`update public.payments set created_at = ${at} where stripe_session_id = $1`, [sessionId])
  await db.query(`update public.profiles set paid_until = ${end} where id = $1`, [userId])
}

const backdate = (userId: string, sessionId: string) => shift(userId, sessionId, 10, 20)

// A Starter renewal paid `ago` days earlier for a period ending `until` days from now.
async function renew(userId: string, ago: number, until: number) {
  const invoice = `in_${randomUUID().replaceAll('-', '')}`
  const { error } = await serviceSupabase().rpc('apply_subscription_renewal', {
    p_user_id: userId, p_product_id: 'starter_monthly', p_invoice_id: invoice, p_period_end: new Date(Date.now() + until * DAY_MS).toISOString(),
    p_amount_total: 1990, p_currency: 'usd', p_amount_tax: 0, p_method: 'card', p_charge_id: null,
  })
  expect(error).toBeNull()
  await db.query(`update public.credit_ledger set created_at = now() - make_interval(days => ${ago}) where idempotency_key = $1`, [`renewal:${invoice}`])
  await db.query(`update public.payments set created_at = now() - make_interval(days => ${ago}) where stripe_invoice_id = $1`, [invoice])
}

describe('a refunded membership ends at once', () => {
  it('one period: paid_until moves to the refund time, its credits come back, no tier', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buyPeriod(userId)
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(30, 2)
    const event = refundAll(charge)
    await deliver(event)
    await deliver(event)
    const profile = await profileOf(db, userId)
    expect(Math.abs(daysFromNow(profile.paid_until))).toBeLessThan(0.01)
    expect(profile.credits).toBe(0)
    expect(await tierOf(userId)).toBeNull()
  })

  it('two stacked periods, the newer refunded: the older one still runs to its end', async () => {
    const userId = await createUser(db, { credits: 0 })
    const older = await buyPeriod(userId)
    await backdate(userId, older.session.id)
    const newer = await buyPeriod(userId)
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(50, 2)

    await deliver(refundAll(newer.charge))
    const profile = await profileOf(db, userId)
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(20, 2)
    expect(profile.credits).toBe(50)
    expect(await tierOf(userId)).toBe('starter')
  })

  it('two stacked periods, the older refunded: the newer one counts from its own purchase', async () => {
    const userId = await createUser(db, { credits: 0 })
    const older = await buyPeriod(userId)
    await backdate(userId, older.session.id)
    await buyPeriod(userId)

    await deliver(refundAll(older.charge))
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(30, 2)
  })

  it('a refunded Pro upgrade leaves the Starter it replaced, never a later end than before', async () => {
    const userId = await createUser(db, { credits: 0 })
    await buyPeriod(userId, 'starter_monthly')
    const pro = await buyPeriod(userId, 'pro_monthly')
    expect(await tierOf(userId)).toBe('pro')
    const before = (await profileOf(db, userId)).paid_until

    await deliver(refundAll(pro.charge))
    const profile = await profileOf(db, userId)
    expect(await tierOf(userId)).toBe('starter')
    expect(profile.paid_until!.getTime()).toBeLessThanOrEqual(before!.getTime())
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(30, 2)
    expect(profile.credits).toBe(50)
  })

  it('a card subscription refund cancels that subscription now (no proration) and mirrors it', async () => {
    const userId = await createUser(db, { credits: 0 })
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', method: 'card' })
    h.subscriptions.set(subscription.id, subscription)
    const session = checkoutSession({ userId, productId: 'starter_monthly', method: 'card', subscription })
    h.sessions.set(session.id, session)
    await deliver(eventFor('checkout.session.completed', session.id))
    const charge = chargeObject({ amount: cents('starter_monthly') })
    h.charges.set(charge.id, charge)
    // The first invoice's charge, as settle_checkout records it from the invoice.
    await db.query('update public.payments set stripe_charge_id = $2 where stripe_session_id = $1', [session.id, charge.id])
    const cancel = h.stripe.subscriptions.cancel as unknown as ReturnType<typeof vi.fn>
    cancel.mockImplementation(async (id: string) => ({ ...structuredClone(h.subscriptions.get(id)), status: 'canceled' }) as Stripe.Subscription)

    await deliver(refundAll(charge))
    expect(cancel).toHaveBeenCalledWith(subscription.id, { prorate: false, invoice_now: false })
    expect((await mirrorOf(db, userId))[0]).toMatchObject({ stripe_subscription_id: subscription.id, status: 'canceled' })
    expect(Math.abs(daysFromNow((await profileOf(db, userId)).paid_until))).toBeLessThan(0.01)
  })
})

describe('which refunds end a membership', () => {
  // Starter 1 Jan → Pro 15 Jan → Max 20 Jan (T66 upgrades), here 19 and 5 days ago and now.
  it('upgrades replay as upgrades: refunding Max leaves the Pro period, not stacked days', async () => {
    const userId = await createUser(db, { credits: 0 })
    const starter = await buyPeriod(userId, 'starter_monthly')
    await shift(userId, starter.session.id, 19, 11)
    const pro = await buyPeriod(userId, 'pro_monthly')
    await shift(userId, pro.session.id, 5, 25)
    const max = await buyPeriod(userId, 'max_monthly')
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(30, 2)

    await deliver(refundAll(max.charge))
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(25, 2)
    expect(await tierOf(userId)).toBe('pro')
  })

  it('after a refunded Pro upgrade, buying Pro again is an upgrade from Starter (not stacked)', async () => {
    const userId = await createUser(db, { credits: 0 })
    await buyPeriod(userId, 'starter_monthly')
    const pro = await buyPeriod(userId, 'pro_monthly')
    await deliver(refundAll(pro.charge))
    await buyPeriod(userId, 'pro_monthly')
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(30, 2)
    expect(await tierOf(userId)).toBe('pro')
  })

  it('a partial refund of an old renewal (Jan of Jan/Feb/Mar) ends nothing and cancels nothing', async () => {
    const userId = await createUser(db, { credits: 0 })
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', method: 'card' })
    h.subscriptions.set(subscription.id, subscription)
    const session = checkoutSession({ userId, productId: 'starter_monthly', method: 'card', subscription })
    h.sessions.set(session.id, session)
    await deliver(eventFor('checkout.session.completed', session.id))
    // January: paid 65 days ago, its period over 35 days ago.
    await shift(userId, session.id, 65, -35)
    await renew(userId, 35, -5)
    await renew(userId, 5, 25)
    const jan = chargeObject({ amount: cents('starter_monthly') })
    h.charges.set(jan.id, jan)
    await db.query('update public.payments set stripe_charge_id = $2 where stripe_session_id = $1', [session.id, jan.id])
    const cancel = h.stripe.subscriptions.cancel as unknown as ReturnType<typeof vi.fn>

    h.charges.set(jan.id, { ...jan, amount_refunded: 500 })
    await deliver(eventFor('charge.refunded', jan.id))
    expect(cancel).not.toHaveBeenCalled()
    expect(daysFromNow((await profileOf(db, userId)).paid_until)).toBeCloseTo(25, 2)
    expect((await mirrorOf(db, userId))[0]).toMatchObject({ status: 'active' })
    expect(await tierOf(userId)).toBe('starter')
  })
})

describe('Waffo refund.succeeded', () => {
  const keys = waffoKeys()
  let deps: WaffoWebhookDeps
  beforeEach(() => {
    deps = { db: serviceSupabase(), products: site.billing.products, publicKey: keys.publicKey, storeId: WAFFO_STORE, mode: 'test', trackBuy: vi.fn() }
  })
  const send = (event: unknown) => {
    const body = JSON.stringify(event)
    return handleWaffoWebhook(deps, { body, signature: signWaffo(body, keys.privateKey) })
  }
  const paymentRow = async (paymentId: string) =>
    (await db.query('select status, amount_total, amount_refunded, credits_clawed_back, clawback_shortfall from public.payments where waffo_payment_id = $1', [paymentId])).rows[0]
  const refundOf = (paymentId: string, refundedAmount?: string) => {
    const event = refundSucceeded(paymentId)
    return refundedAmount ? { ...event, data: { ...event.data, refundedAmount } } : event
  }

  it('each refund adds its own amount once; the credits follow the refunded share', async () => {
    const userId = await createUser(db, { credits: 0 })
    const order = orderCompleted({ userId, productId: 'pack_s' })
    await send(order)
    expect(await paymentRow(order.eventId)).toMatchObject({ amount_total: 2149 })

    const first = refundOf(order.eventId, '10.00')
    expect(await send(first)).toMatchObject({ status: 200, body: { outcome: 'recorded' } })
    await send(first)
    // 20 × 1000 / 2149 = 9.3 → 9
    expect(await paymentRow(order.eventId)).toMatchObject({ status: 'partially_refunded', amount_refunded: 1000, credits_clawed_back: 9 })
    expect((await profileOf(db, userId)).credits).toBe(11)

    await send(refundOf(order.eventId, '11.49'))
    expect(await paymentRow(order.eventId)).toMatchObject({ status: 'refunded', amount_refunded: 2149, credits_clawed_back: 20 })
    expect((await profileOf(db, userId)).credits).toBe(0)
  })

  it('a refund that names no amount counts as the rest of the payment', async () => {
    const userId = await createUser(db, { credits: 0 })
    const order = orderCompleted({ userId, productId: 'starter_monthly' })
    await send(order)
    await send(refundOf(order.eventId))
    const profile = await profileOf(db, userId)
    expect(await paymentRow(order.eventId)).toMatchObject({ status: 'refunded', credits_clawed_back: 50 })
    expect(profile.credits).toBe(0)
    expect(Math.abs(daysFromNow(profile.paid_until))).toBeLessThan(0.01)
  })

  it('a refund for a payment we have no row for changes nothing and answers 200', async () => {
    expect(await send(refundOf('PAY_unknown0000000000000000'))).toMatchObject({ status: 200, body: { outcome: 'unknown_payment' } })
  })
})
