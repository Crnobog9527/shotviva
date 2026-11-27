import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { handleStripeWebhook } from '@/core/billing/stripe'
import { handleWaffoWebhook, type WaffoWebhookDeps } from '@/core/billing/waffo'
import { paymentCodeEffects } from '@/core/billing'
import { site } from '@/site/site.config'

import { WAFFO_STORE, orderCompleted, refundSucceeded, signWaffo, subscriptionPaid, waffoKeys } from '../fakes/waffo'
import { connectAdmin, createUser, profileOf } from './helpers'
import {
  chargeObject,
  checkoutSession,
  eventFor,
  invoiceObject,
  signed,
  stripeHarness,
  subscriptionObject,
  type Harness,
} from './stripe-fixtures'
import { serviceSupabase } from './supabase-env'

// F3 (ARCHITECTURE §6.2 订单手续费): each settled payment's fee lines, written by the real webhooks
// through payment_fee_record against local Supabase, with signed fake events and Stripe objects
// shaped like F1's test-mode measurements. record_from is set for this file only (committed,
// because the webhook writes through PostgREST) and put back afterwards.

let db: Client
let h: Harness
let waffo: WaffoWebhookDeps
let recordFrom: Date | null = null
const keys = waffoKeys()

beforeAll(async () => {
  db = await connectAdmin()
  recordFrom = (await db.query('select record_from from payment_fee_settings')).rows[0].record_from
  await db.query("update payment_fee_settings set record_from = now() - interval '1 minute'")
})
afterAll(async () => {
  await db.query('update payment_fee_settings set record_from = $1', [recordFrom])
  await db.end()
})
beforeEach(() => {
  h = stripeHarness()
  const admin = serviceSupabase()
  waffo = { db: admin, applyCodes: paymentCodeEffects(admin, site.growth.invite), products: site.billing.products, publicKey: keys.publicKey, storeId: WAFFO_STORE, mode: 'test' }
})

const deliverStripe = (event: unknown) => handleStripeWebhook(h.deps, signed(event))
function deliverWaffo(event: unknown) {
  const body = JSON.stringify(event)
  return handleWaffoWebhook(waffo, { body, signature: signWaffo(body, keys.privateKey) })
}

async function paymentId(column: 'stripe_session_id' | 'stripe_invoice_id' | 'waffo_payment_id', value: string) {
  const { rows } = await db.query(`select id from payments where ${column} = $1`, [value])
  return rows[0]?.id as string
}
async function feesOf(id: string) {
  const lines = (await db.query(
    `select kind, amount_cents, source, status, revision, refund_id, rate_bp, fixed_cents
       from payment_fee_lines_current($1)`, [id])).rows
  const total = (await db.query('select fee_cents, fee_status from payments where id = $1', [id])).rows[0]
  const written = (await db.query('select count(*)::int n from payment_fee_lines where payment_id = $1', [id])).rows[0].n
  return { lines: lines.map(l => `${l.kind} ${l.amount_cents} ${l.source}/${l.status}`), total, written, raw: lines }
}

type Detail = { type: string; amount: number; description?: string }
// A charge as charges.retrieve / the session expand returns it with balance_transaction.
function billed(base: Stripe.Charge, bt: { amount: number; details: Detail[]; exchangeRate?: number }, country?: string): Stripe.Charge {
  return {
    ...base,
    payment_method_details: { ...base.payment_method_details, ...(country && { card: { country } }) },
    balance_transaction: {
      id: `txn_${base.id.slice(3)}`, object: 'balance_transaction', amount: bt.amount, currency: 'usd',
      exchange_rate: bt.exchangeRate ?? null, fee: bt.details.reduce((s, d) => s + d.amount, 0),
      fee_details: bt.details.map(d => ({ currency: 'usd', application: null, description: d.description ?? null, ...d })),
    },
  } as unknown as Stripe.Charge
}

describe('Stripe', () => {
  it('a 中国银行卡 pack: the real 74¢ split into acquiring 59 + international 15, plus Radar 5¢ estimated; a replay adds nothing', async () => {
    const userId = await createUser(db)
    const charge = billed(chargeObject({ amount: 990 }), { amount: 990, details: [{ type: 'stripe_fee', amount: 74, description: 'Stripe processing fees' }] }, 'CN')
    const session = checkoutSession({ userId, productId: 'pack_s', method: 'cn_card', charge })
    h.sessions.set(session.id, session)
    const event = eventFor('checkout.session.completed', session.id)

    expect((await deliverStripe(event)).body).toMatchObject({ outcome: 'applied' })
    const id = await paymentId('stripe_session_id', session.id)
    const fees = await feesOf(id)
    expect(fees.lines).toEqual(['intl_card 15 stripe_bt/final', 'acquiring 59 stripe_bt/final', 'radar 5 formula/estimated'])
    expect(fees.total).toEqual({ fee_cents: 79, fee_status: 'estimated' })
    expect(fees.raw[0]).toMatchObject({ rate_bp: 150, fixed_cents: 0 })

    expect((await deliverStripe(event)).body).toMatchObject({ outcome: 'replayed' })
    expect((await deliverStripe(eventFor('checkout.session.async_payment_succeeded', session.id))).status).toBe(200)
    expect((await feesOf(id)).written).toBe(3)
  })

  it('a ¥72 charge: Stripe’s conversion detail is the FX line, the rest splits to the cent', async () => {
    const userId = await createUser(db)
    const details = [{ type: 'stripe_fee', amount: 11, description: 'Stripe currency conversion fee' }, { type: 'stripe_fee', amount: 77, description: 'Stripe processing fees' }]
    const charge = billed(chargeObject({ amount: 7200 }), { amount: 1078, details, exchangeRate: 0.149765 }, 'CN')
    const session = checkoutSession({ userId, productId: 'pack_s', method: 'cn_card', charge })
    h.sessions.set(session.id, session)

    await deliverStripe(eventFor('checkout.session.completed', session.id))
    const fees = await feesOf(await paymentId('stripe_session_id', session.id))
    expect(fees.lines).toEqual(['fx 11 stripe_bt/final', 'intl_card 16 stripe_bt/final', 'acquiring 61 stripe_bt/final', 'radar 5 formula/estimated'])
  })

  it('a Managed Payments subscription: withheld tax is not a fee; MP 3.5% and Billing 0.7% on the tax-inclusive amount, no Radar', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'pro_monthly' })
    h.subscriptions.set(subscription.id, subscription)
    const base = chargeObject({ amount: 5240 })
    h.charges.set(base.id, billed(base, { amount: 5240, details: [{ type: 'withheld_tax', amount: 250, description: 'Withheld sales tax' }, { type: 'stripe_fee', amount: 182 }] }, 'US'))
    const invoice = invoiceObject({ subscription, billingReason: 'subscription_create', amountPaid: 5240, tax: 250, periodEndDays: 30, chargeId: base.id })
    h.invoices.set(invoice.id, invoice)
    const session = checkoutSession({ userId, productId: 'pro_monthly', method: 'card', subscription, invoice, tax: 250 })
    h.sessions.set(session.id, session)

    expect((await deliverStripe(eventFor('checkout.session.completed', session.id))).body).toMatchObject({ outcome: 'applied' })
    const fees = await feesOf(await paymentId('stripe_session_id', session.id))
    expect(fees.lines).toEqual(['acquiring 182 stripe_bt/final', 'mp 183 formula/estimated', 'billing 37 formula/estimated'])
    expect(fees.total).toEqual({ fee_cents: 402, fee_status: 'estimated' })
  })

  it('a 中国银行卡 renewal: the invoice’s charge is read once more for its balance transaction', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', method: 'cn_card' })
    h.subscriptions.set(subscription.id, subscription)
    const base = chargeObject({ amount: 1990 })
    h.charges.set(base.id, billed(base, { amount: 1990, details: [{ type: 'stripe_fee', amount: 118 }] }, 'CN'))
    const invoice = invoiceObject({ subscription, amountPaid: 1990, periodEndDays: 60, chargeId: base.id })
    h.invoices.set(invoice.id, invoice)

    expect((await deliverStripe(eventFor('invoice.paid', invoice.id))).body).toMatchObject({ outcome: 'applied' })
    const id = await paymentId('stripe_invoice_id', invoice.id)
    expect((await feesOf(id)).lines).toEqual(['intl_card 30 stripe_bt/final', 'acquiring 88 stripe_bt/final', 'billing 14 formula/estimated', 'radar 5 formula/estimated'])
    expect((await deliverStripe(eventFor('invoice.paid', invoice.id))).body).toMatchObject({ outcome: 'replayed' })
    expect((await feesOf(id)).written).toBe(4)
  })

  it('Alipay: acquiring from the bill and Radar, no card surcharge', async () => {
    const userId = await createUser(db)
    const charge = billed(chargeObject({ amount: 990, method: 'alipay' }), { amount: 990, details: [{ type: 'stripe_fee', amount: 59 }] })
    const session = checkoutSession({ userId, productId: 'pack_s', method: 'alipay', charge })
    h.sessions.set(session.id, session)
    await deliverStripe(eventFor('checkout.session.completed', session.id))
    expect((await feesOf(await paymentId('stripe_session_id', session.id))).lines).toEqual(['acquiring 59 stripe_bt/final', 'radar 5 formula/estimated'])
  })

  it('no balance transaction on the charge yet: published-rate estimates on the USD amount', async () => {
    const userId = await createUser(db)
    const charge = chargeObject({ amount: 990, method: 'alipay' })
    // Read again for its balance transaction, which Stripe still has not attached.
    h.charges.set(charge.id, charge)
    const session = checkoutSession({ userId, productId: 'pack_s', method: 'alipay', charge })
    h.sessions.set(session.id, session)
    await deliverStripe(eventFor('checkout.session.completed', session.id))
    const id = await paymentId('stripe_session_id', session.id)
    const { amount_total: cents } = (await db.query('select amount_total from payments where id = $1', [id])).rows[0]
    expect((await feesOf(id)).lines).toEqual([`acquiring ${Math.floor((cents * 290 + 5000) / 10000) + 30} estimate/estimated`, 'radar 5 formula/estimated'])
  })

  it('a fee step that fails never fails the payment: credits granted, 200, no lines', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', method: 'cn_card' })
    h.subscriptions.set(subscription.id, subscription)
    // The invoice names a charge Stripe does not answer for: the re-read for its fee throws.
    const invoice = invoiceObject({ subscription, amountPaid: 1990, periodEndDays: 60, chargeId: 'ch_missing' })
    h.invoices.set(invoice.id, invoice)
    const before = (await profileOf(db, userId)).credits

    expect(await deliverStripe(eventFor('invoice.paid', invoice.id))).toMatchObject({ status: 200, body: { outcome: 'applied' } })
    expect((await profileOf(db, userId)).credits).toBeGreaterThan(before)
    expect(await feesOf(await paymentId('stripe_invoice_id', invoice.id))).toMatchObject({ written: 0, total: { fee_cents: null, fee_status: null } })
  })

  it('with record_from unset nothing is written and Stripe is not asked again', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly', method: 'cn_card' })
    h.subscriptions.set(subscription.id, subscription)
    const base = chargeObject({ amount: 1990 })
    h.charges.set(base.id, billed(base, { amount: 1990, details: [{ type: 'stripe_fee', amount: 118 }] }, 'CN'))
    const invoice = invoiceObject({ subscription, amountPaid: 1990, periodEndDays: 60, chargeId: base.id })
    h.invoices.set(invoice.id, invoice)
    await db.query('update payment_fee_settings set record_from = null')
    try {
      expect((await deliverStripe(eventFor('invoice.paid', invoice.id))).body).toMatchObject({ outcome: 'applied' })
    } finally {
      await db.query("update payment_fee_settings set record_from = now() - interval '1 minute'")
    }
    expect(h.stripe.charges.retrieve).not.toHaveBeenCalled()
    expect(await feesOf(await paymentId('stripe_invoice_id', invoice.id))).toMatchObject({ written: 0, total: { fee_cents: null, fee_status: null } })
  })
})

describe('Waffo', () => {
  // orderCompleted charges $21.49 tax included: card ceil(3.9% × 2149) + 50 = 84 + 50.
  it('a card order: 3.9% + $0.50 rounded up, estimated; redelivery adds nothing', async () => {
    const userId = await createUser(db)
    const event = orderCompleted({ userId, productId: 'pack_m' })
    expect((await deliverWaffo(event)).body).toMatchObject({ outcome: 'applied' })
    const id = await paymentId('waffo_payment_id', event.eventId)
    expect(await feesOf(id)).toMatchObject({ lines: ['acquiring 134 estimate/estimated'], total: { fee_cents: 134, fee_status: 'estimated' } })
    expect((await deliverWaffo(event)).body).toMatchObject({ outcome: 'replayed' })
    expect((await feesOf(id)).written).toBe(1)
  })

  it.each([['wechat_pay'], ['alipay']] as const)('%s: 3.9%%, no fixed fee', async (method) => {
    const userId = await createUser(db)
    const event = orderCompleted({ userId, productId: 'pack_m', method })
    await deliverWaffo(event)
    expect((await feesOf(await paymentId('waffo_payment_id', event.eventId))).lines).toEqual(['acquiring 84 estimate/estimated'])
  })

  it('a card subscription charge takes the same estimate', async () => {
    const userId = await createUser(db)
    const event = subscriptionPaid({ userId, productId: 'pro_monthly' })
    await deliverWaffo(event)
    expect((await feesOf(await paymentId('waffo_payment_id', event.eventId))).lines).toEqual(['acquiring 134 estimate/estimated'])
  })

  it('a card refund adds its $1 fee on its own refund scope, once; the charge’s fee stays', async () => {
    const userId = await createUser(db)
    const order = orderCompleted({ userId, productId: 'pack_m' })
    await deliverWaffo(order)
    const refund = refundSucceeded(order.eventId)
    expect((await deliverWaffo(refund)).body).toMatchObject({ outcome: 'recorded' })
    expect((await deliverWaffo(refund)).status).toBe(200)
    const fees = await feesOf(await paymentId('waffo_payment_id', order.eventId))
    expect(fees.lines).toEqual(['acquiring 134 estimate/estimated', 'refund_fee 100 estimate/estimated'])
    expect(fees.raw[1]).toMatchObject({ refund_id: refund.eventId })
    expect(fees).toMatchObject({ written: 2, total: { fee_cents: 234, fee_status: 'estimated' } })
  })

  it('a wallet refund has no fee line', async () => {
    const userId = await createUser(db)
    const order = orderCompleted({ userId, productId: 'pack_m', method: 'wechat_pay' })
    await deliverWaffo(order)
    await deliverWaffo(refundSucceeded(order.eventId))
    expect((await feesOf(await paymentId('waffo_payment_id', order.eventId))).lines).toEqual(['acquiring 84 estimate/estimated'])
  })

  it('a payment made before record_from keeps no fee lines, nor does its refund', async () => {
    const userId = await createUser(db)
    const order = orderCompleted({ userId, productId: 'pack_m' })
    await db.query("update payment_fee_settings set record_from = now() + interval '1 day'")
    try {
      await deliverWaffo(order)
      await deliverWaffo(refundSucceeded(order.eventId))
    } finally {
      await db.query("update payment_fee_settings set record_from = now() - interval '1 minute'")
    }
    expect(await feesOf(await paymentId('waffo_payment_id', order.eventId))).toMatchObject({ written: 0, total: { fee_cents: null, fee_status: null } })
  })
})
