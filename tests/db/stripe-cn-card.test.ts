import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { handleStripeWebhook } from '@/core/billing/stripe'

import { connectAdmin, createUser, profileOf } from './helpers'
import {
  chargeObject,
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

// T64 (ARCHITECTURE §6.1 payments, §6.3): 中国银行卡 is the plain Stripe card route. It settles
// through the same webhook and SQL functions as the Managed Payments card; payments.method
// records cn_card so the account card and /admin/orders can tell the two card routes apart,
// and a renewal keeps the route its subscription was opened on.

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

describe('中国银行卡 (cn_card)', () => {
  it('a pack: credits granted, payment recorded as cn_card, purchase tracked as cn_card', async () => {
    const userId = await createUser(db)
    const charge = chargeObject({ amount: 2490 })
    h.charges.set(charge.id, charge)
    const session = checkoutSession({ userId, productId: 'pack_m', method: 'cn_card', charge })
    h.sessions.set(session.id, session)

    expect((await deliver(eventFor('checkout.session.completed', session.id))).body).toMatchObject({ outcome: 'applied' })
    expect(await profileOf(db, userId)).toMatchObject({ credits: 55 })
    expect(await paymentsOf(db, userId)).toEqual([
      expect.objectContaining({ product_id: 'pack_m', stripe_charge_id: charge.id, method: 'cn_card', amount_tax: 0, status: 'paid' }),
    ])
    expect(h.trackBuy).toHaveBeenCalledWith(userId, expect.objectContaining({ form: 'one_time', method: 'cn_card' }), 'en')
  })

  it('a Starter monthly subscription, then its renewal, both recorded as cn_card', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', method: 'cn_card' })
    h.subscriptions.set(subscription.id, subscription)
    const first = invoiceObject({ subscription, billingReason: 'subscription_create', amountPaid: 1990, periodEndDays: 30 })
    h.invoices.set(first.id, first)
    const session = checkoutSession({ userId, productId: 'starter_monthly', method: 'cn_card', subscription, invoice: first })
    h.sessions.set(session.id, session)
    expect((await deliver(eventFor('checkout.session.completed', session.id))).body).toMatchObject({ outcome: 'applied' })
    expect(await mirrorOf(db, userId)).toEqual([expect.objectContaining({ stripe_subscription_id: subscription.id, status: 'active' })])

    const renewal = invoiceObject({ subscription, amountPaid: 1990, periodEndDays: 60 })
    h.invoices.set(renewal.id, renewal)
    expect((await deliver(eventFor('invoice.paid', renewal.id))).body).toMatchObject({ outcome: 'applied' })

    expect(await profileOf(db, userId)).toMatchObject({ credits: 100 })
    const payments = await paymentsOf(db, userId)
    expect(payments.map((p) => [p.stripe_invoice_id, p.method])).toEqual([
      [first.id, 'cn_card'],
      [renewal.id, 'cn_card'],
    ])
    expect(h.trackBuy).toHaveBeenLastCalledWith(userId, expect.objectContaining({ form: 'subscription', method: 'cn_card' }), 'en')
  })

  it('the Managed Payments card still records card', async () => {
    const userId = await createUser(db)
    const charge = chargeObject({ amount: 990 })
    h.charges.set(charge.id, charge)
    const session = checkoutSession({ userId, productId: 'pack_s', method: 'card', charge })
    h.sessions.set(session.id, session)
    await deliver(eventFor('checkout.session.completed', session.id))
    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ method: 'card' })])
  })
})
