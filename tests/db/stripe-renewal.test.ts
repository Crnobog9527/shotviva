import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { currentTier } from '@/core/billing'
import { handleStripeWebhook } from '@/core/billing/stripe'
import type { ProductId } from '@/core/config'

import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf, serviceClient, setBalances } from './helpers'
import {
  checkoutSession,
  eventFor,
  invoiceObject,
  mirrorOf,
  paymentsOf,
  signed,
  stripeHarness,
  subscriptionObject,
  type Harness,
} from './stripe-fixtures'

// AGENTS §7 test 2 (Stripe renewals) and test 4 (paid_until): one invoice.paid grants once,
// only subscription_cycle invoices grant, paid_until aligns to the paid period's end and never
// moves backwards, subscription.updated / deleted only touch the mirror. Real local Supabase,
// real signature checks, Stripe objects from fixtures.

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
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))
const PRICE: Partial<Record<ProductId, number>> = { starter_monthly: 1990, pro_monthly: 4990, max_yearly: 71300 }

// A card subscription whose first payment has settled (T9 path), as the renewals build on it.
async function subscribe(userId: string, productId: ProductId, periodEndDays = 30) {
  const subscription = subscriptionObject({ periodEndDays, userId, productId })
  h.subscriptions.set(subscription.id, subscription)
  const first = invoiceObject({ subscription, billingReason: 'subscription_create', amountPaid: PRICE[productId] ?? 0, periodEndDays })
  h.invoices.set(first.id, first)
  const session = checkoutSession({ userId, productId, method: 'card', subscription, invoice: first })
  h.sessions.set(session.id, session)
  expect((await deliver(eventFor('checkout.session.completed', session.id))).body.outcome).toBe('applied')
  return { subscription, first, session }
}

function renewalInvoice(subscription: Stripe.Subscription, input: Partial<Parameters<typeof invoiceObject>[0]> = {}) {
  const invoice = invoiceObject({ subscription, amountPaid: 2189, tax: 199, periodEndDays: 60, ...input })
  h.invoices.set(invoice.id, invoice)
  return invoice
}

const periodEnd = (invoice: Stripe.Invoice) => new Date((invoice.lines.data[0]?.period.end ?? 0) * 1000)

describe('first payment records the payment (settle_checkout)', () => {
  it('a card subscription: session, first invoice and its charge, amount with tax', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly' })
    const first = invoiceObject({ subscription, billingReason: 'subscription_create', amountPaid: 2189, tax: 199, periodEndDays: 30 })
    h.invoices.set(first.id, first)
    const session = checkoutSession({ userId, productId: 'starter_monthly', method: 'card', subscription, invoice: first, tax: 199 })
    h.sessions.set(session.id, session)
    const event = eventFor('checkout.session.completed', session.id)

    await deliver(event)
    await deliver(event)

    const chargeId = first.payments?.data[0]?.payment.payment_intent
    expect(await paymentsOf(db, userId)).toEqual([
      {
        product_id: 'starter_monthly',
        channel: 'stripe',
        stripe_session_id: session.id,
        stripe_invoice_id: first.id,
        stripe_charge_id: typeof chargeId === 'object' ? chargeId?.latest_charge : null,
        amount_total: 2189,
        amount_tax: 199,
        amount_refunded: 0,
        currency: 'usd',
        method: 'card',
        status: 'paid',
      },
    ])
  })

  it('the first invoice.paid (subscription_create) is ignored: the session already granted it', async () => {
    const userId = await createUser(db)
    const { first } = await subscribe(userId, 'starter_monthly')
    expect((await deliver(eventFor('invoice.paid', first.id))).body.outcome).toBe('ignored')
    expect((await profileOf(db, userId)).credits).toBe(50)
    expect(await paymentsOf(db, userId)).toHaveLength(1)
  })
})

describe('invoice.paid (subscription_cycle) → apply_subscription_renewal', () => {
  it('grants one period, aligns paid_until to the period end and records the payment', async () => {
    const userId = await createUser(db, { freeCredits: 6 })
    const { subscription } = await subscribe(userId, 'starter_monthly')
    const renewal = renewalInvoice(subscription, { periodEndDays: 61 })

    const result = await deliver(eventFor('invoice.paid', renewal.id))

    expect(result).toEqual({ status: 200, body: { received: true, outcome: 'applied' } })
    const profile = await profileOf(db, userId)
    expect(profile).toMatchObject({ credits: 100, free_credits: 6 })
    // Exactly Stripe's period end, not first payment + 30 + 30 days.
    expect(profile.paid_until?.getTime()).toBe(periodEnd(renewal).getTime())
    expect(await ledgerOf(db, userId)).toEqual([
      expect.objectContaining({ kind: 'purchase', idempotency_key: expect.stringMatching(/^purchase:cs_/) }),
      { kind: 'purchase', pool: 'paid', delta: 50, idempotency_key: `renewal:${renewal.id}` },
    ])
    const payments = await paymentsOf(db, userId)
    expect(payments[1]).toEqual({
      product_id: 'starter_monthly',
      channel: 'stripe',
      stripe_session_id: null,
      stripe_invoice_id: renewal.id,
      stripe_charge_id: expect.stringMatching(/^ch_/),
      amount_total: 2189,
      amount_tax: 199,
      amount_refunded: 0,
      currency: 'usd',
      method: 'card',
      status: 'paid',
    })
    expect(h.trackBuy).toHaveBeenLastCalledWith(userId, expect.objectContaining({ product_id: 'starter_monthly', form: 'subscription', amount_usd: 19.9 }), 'en')
    // The renewal keeps the tier (current_tier reads the newest membership ledger row).
    expect(await currentTier(serviceClient(), userId)).toBe('starter')
  })

  it('the same invoice delivered three times (and as different events) grants once', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'pro_monthly')
    const renewal = renewalInvoice(subscription)
    const event = eventFor('invoice.paid', renewal.id)

    const outcomes = []
    for (let i = 0; i < 3; i += 1) outcomes.push((await deliver(event)).body.outcome)
    outcomes.push((await deliver(eventFor('invoice.paid', renewal.id))).body.outcome)

    expect(outcomes).toEqual(['applied', 'replayed', 'replayed', 'replayed'])
    expect((await profileOf(db, userId)).credits).toBe(270)
    expect(await paymentsOf(db, userId)).toHaveLength(2)
    expect(h.trackBuy).toHaveBeenCalledTimes(2)
  })

  it.each(['subscription_create', 'subscription_update', 'manual', 'subscription_threshold'] as const)(
    'a %s invoice grants nothing',
    async (billingReason) => {
      const userId = await createUser(db)
      const { subscription } = await subscribe(userId, 'starter_monthly')
      const before = await profileOf(db, userId)
      const invoice = renewalInvoice(subscription, { billingReason })

      expect((await deliver(eventFor('invoice.paid', invoice.id))).body.outcome).toBe('ignored')
      expect(await profileOf(db, userId)).toEqual(before)
      expect(await paymentsOf(db, userId)).toHaveLength(1)
    },
  )

  it('an invoice that is not paid grants nothing (a failed renewal does nothing)', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'starter_monthly')
    const before = await profileOf(db, userId)
    const invoice = renewalInvoice(subscription, { status: 'open' })
    expect((await deliver(eventFor('invoice.paid', invoice.id))).body.outcome).toBe('unpaid')
    expect(await profileOf(db, userId)).toEqual(before)
  })

  it('paid_until never moves backwards: a later window stays, a late older invoice changes nothing', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'starter_monthly')
    // Meanwhile an Alipay year pushed paid_until far out.
    const farOut = new Date(Date.now() + 400 * DAY_MS)
    await setBalances(db, userId, { credits: 50, paidUntil: farOut })

    const renewal = renewalInvoice(subscription, { periodEndDays: 60 })
    await deliver(eventFor('invoice.paid', renewal.id))
    let profile = await profileOf(db, userId)
    expect(profile.credits).toBe(100)
    expect(profile.paid_until?.getTime()).toBe(farOut.getTime())

    // Two renewals arrive out of order: the newer period wins, the older one only adds credits.
    await setBalances(db, userId, { credits: 100, paidUntil: new Date(Date.now() + 10 * DAY_MS) })
    const newer = renewalInvoice(subscription, { periodEndDays: 90 })
    const older = renewalInvoice(subscription, { periodEndDays: 60 })
    await deliver(eventFor('invoice.paid', newer.id))
    await deliver(eventFor('invoice.paid', older.id))
    profile = await profileOf(db, userId)
    expect(profile.credits).toBe(200)
    expect(profile.paid_until?.getTime()).toBe(periodEnd(newer).getTime())
  })

  it('a yearly renewal grants the year and runs paid_until to its end', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'max_yearly', 365)
    const renewal = renewalInvoice(subscription, { amountPaid: 71300, tax: 0, periodEndDays: 730 })
    await deliver(eventFor('invoice.paid', renewal.id))
    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(3360 * 2)
    expect(profile.paid_until?.getTime()).toBe(periodEnd(renewal).getTime())
  })

  it('refuses a subscription whose Price is another product (500, nothing granted)', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'starter_monthly')
    const other = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', priceProductId: 'max_monthly' })
    h.subscriptions.set(subscription.id, { ...subscription, items: other.items })
    const renewal = renewalInvoice(subscription)

    expect((await deliver(eventFor('invoice.paid', renewal.id))).status).toBe(500)
    expect((await profileOf(db, userId)).credits).toBe(50)
  })
})

describe('customer.subscription.updated / deleted → mirror only', () => {
  it('a Portal cancellation sets cancel_at_period_end and leaves credits and paid_until alone', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'pro_monthly')
    const before = await profileOf(db, userId)
    h.subscriptions.set(subscription.id, { ...subscription, cancel_at_period_end: true })

    expect((await deliver(eventFor('customer.subscription.updated', subscription.id))).body.outcome).toBe('synced')
    expect(await mirrorOf(db, userId)).toEqual([expect.objectContaining({ status: 'active', cancel_at_period_end: true })])
    expect(await profileOf(db, userId)).toEqual(before)
  })

  it('deleted marks the mirror canceled and changes nothing else', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'starter_monthly')
    const before = await profileOf(db, userId)
    const ledgerBefore = await ledgerOf(db, userId)
    h.subscriptions.set(subscription.id, { ...subscription, status: 'canceled' })
    const event = eventFor('customer.subscription.deleted', subscription.id)

    await deliver(event)
    await deliver(event)

    expect(await mirrorOf(db, userId)).toEqual([expect.objectContaining({ stripe_subscription_id: subscription.id, status: 'canceled' })])
    expect(await profileOf(db, userId)).toEqual(before)
    expect(await ledgerOf(db, userId)).toEqual(ledgerBefore)
  })

  it('a late updated event writes Stripe’s current state, not the one it carried', async () => {
    const userId = await createUser(db)
    const { subscription } = await subscribe(userId, 'starter_monthly')
    h.subscriptions.set(subscription.id, { ...subscription, status: 'past_due' })
    await deliver(eventFor('customer.subscription.updated', subscription.id))
    expect(await mirrorOf(db, userId)).toEqual([expect.objectContaining({ status: 'past_due' })])
  })

  it('an update for a subscription with no settled first payment changes nothing (200)', async () => {
    const subscription = subscriptionObject({ periodEndDays: 30 })
    h.subscriptions.set(subscription.id, subscription)
    expect(await deliver(eventFor('customer.subscription.updated', subscription.id))).toEqual({
      status: 200,
      body: { received: true, outcome: 'unknown' },
    })
    const { rows } = await db.query('select 1 from public.subscriptions where stripe_subscription_id = $1', [subscription.id])
    expect(rows).toEqual([])
  })
})
