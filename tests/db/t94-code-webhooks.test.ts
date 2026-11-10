import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { paymentCodeEffects } from '@/core/billing'
import { applyReplay, handleStripeWebhook } from '@/core/billing/stripe'
import { handleWaffoWebhook } from '@/core/billing/waffo'
import type { ProductId } from '@/core/config'
import { logger } from '@/core/logger'
import { site } from '@/site/site.config'

import { orderCompleted, signWaffo, subscriptionPaid, WAFFO_STORE, waffoKeys } from '../fakes/waffo'
import { benefits, invite, pack, seededRewards } from '../t94-config'
import { connectAdmin, createUser, ledgerOf } from './helpers'
import { checkoutSession, eventFor, invoiceObject, signed, stripeHarness, subscriptionObject } from './stripe-fixtures'
import { serviceSupabase } from './supabase-env'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

async function customer() {
  const buyer = await createUser(db)
  const inviter = await createUser(db)
  await db.query("select public.grant_credits($1,$3,'signup',$2,'free')", [buyer, 'signup:' + buyer, benefits.freeCredits])
  const { rows: [offer] } = await db.query('select public.get_or_create_invite_code($1) as code', [inviter])
  const { rows: [result] } = await db.query("select public.redeem_code($1,$2,'signup',$3,$4) as claim",
    [buyer, offer.code, null, invite.windowDays])
  expect(result.claim.status).toBe('ok')
  return { buyer, inviter }
}

async function campaign(buyer: string, productId: ProductId = pack.id, duration: 'once' | 'repeating' | 'forever' = 'once') {
  const text = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
  const { rows: [code] } = await db.query<{ id: string; code: string }>(
    "insert into public.codes(code,kind,discount_percent,discount_products,discount_duration,discount_months,stripe_coupon_id) values($1,'campaign',20,$2,$3,$4,$5) returning id,code",
    [text, [productId], duration, duration === 'repeating' ? 2 : null, randomUUID()])
  const { rows: [result] } = await db.query("select public.redeem_code($1,$2,'account',$3,$4) as claim", [buyer, text, null, invite.windowDays])
  expect(result.claim.status).toBe('ok')
  return code
}

it('repairs Stripe effects through admin replay, preserves a second paid session and flags its discount conflict', async () => {
  const { buyer, inviter } = await customer()
  const offer = await campaign(buyer)
  const h = stripeHarness()
  const trackReward = vi.fn()
  const effects = paymentCodeEffects(serviceSupabase(), invite, trackReward)
  h.deps.applyCodes = vi.fn(effects).mockRejectedValueOnce(new Error('transient code effects failure'))
  const warn = vi.spyOn(logger, 'warn')
  const stage = () => {
    const session = checkoutSession({ userId: buyer, method: 'cn_card', productId: pack.id })
    session.metadata = { ...session.metadata, code_id: offer.id, code: offer.code }
    session.currency = 'jpy'
    session.amount_subtotal = 1500
    session.amount_total = 1200
    session.total_details = { amount_tax: 0, amount_shipping: 0, amount_discount: 300 }
    h.sessions.set(session.id, session)
    return session.id
  }
  const first = stage()
  const deliver = (id: string) => handleStripeWebhook(h.deps, signed(eventFor('checkout.session.completed', id)))
  try {
    expect((await deliver(first)).status).toBe(500)
    expect(h.trackBuy).toHaveBeenCalledWith(buyer, expect.objectContaining({ code: offer.code, amount_discount_usd: Math.round(pack.priceUsd * 20) / 100 }), 'en')
    expect((await applyReplay(h.deps, first)).outcome).toBe('replayed')
    expect((await deliver(first)).status).toBe(200)
    const second = stage()
    expect((await deliver(second)).status).toBe(200)
    expect((await deliver(second)).status).toBe(200)
    const { rows } = await db.query('select id,code_id,amount_discount,amount_total,code_discount_conflict from payments where user_id=$1 order by id', [buyer])
    expect(rows).toEqual([false, true].map(conflict => expect.objectContaining({
      code_id: offer.id, amount_discount: 300, amount_total: 1200, code_discount_conflict: conflict,
    })))
    expect(warn).toHaveBeenCalledWith('billing.code_discount_conflict', { payment_id: Number(rows[1].id), code_id: offer.id })
    expect(trackReward.mock.calls).toEqual([[inviter, { credits: seededRewards.inviterCredits, product_id: pack.id }, 'en']])
    const { rows: [redemption] } = await db.query('select discount_used_payment_id from code_redemptions where code_id=$1 and user_id=$2', [offer.id, buyer])
    expect(redemption.discount_used_payment_id).toBe(rows[0].id)
    expect(await ledgerOf(db, inviter)).toMatchObject([{ kind: 'invite_reward', pool: 'paid', delta: seededRewards.inviterCredits }])
    expect(h.trackBuy).toHaveBeenCalledTimes(2)
    expect((await ledgerOf(db, buyer)).filter(row => row.kind === 'purchase')).toHaveLength(2)
  } finally { warn.mockRestore() }
})

it.each(['one_time', 'subscription'] as const)('applies only the referral on Waffo %s, leaves the pending discount and skips renewals', async form => {
  const { buyer, inviter } = await customer()
  const user = { userId: buyer, productId: 'starter_monthly' as const }
  const offer = await campaign(buyer, user.productId)
  const admin = serviceSupabase()
  const trackReward = vi.fn()
  const applyCodes = vi.fn(paymentCodeEffects(admin, invite, trackReward))
  const keys = waffoKeys()
  const deps = { db: admin, applyCodes, products: site.billing.products, publicKey: keys.publicKey, storeId: WAFFO_STORE, mode: 'test' as const, trackBuy: vi.fn() }
  const event = form === 'subscription' ? subscriptionPaid(user) : orderCompleted(user)
  const deliver = (event: unknown) => {
    const body = JSON.stringify(event)
    return handleWaffoWebhook(deps, { body, signature: signWaffo(body, keys.privateKey) })
  }
  expect((await deliver(event)).status).toBe(200)
  expect((await deliver(event)).status).toBe(200)
  expect(applyCodes).toHaveBeenCalledTimes(2)
  if (form === 'subscription') {
    const renewal = subscriptionPaid({ ...user, orderId: String(event.data.orderId), periodNumber: 2 })
    expect((await deliver(renewal)).status).toBe(200)
    expect(applyCodes).toHaveBeenCalledTimes(2)
  }
  expect(trackReward.mock.calls).toEqual([[inviter, { credits: seededRewards.inviterCredits, product_id: user.productId }, 'en']])
  const { rows } = await db.query('select code_id,amount_discount,amount_total,amount_tax from payments where user_id=$1 order by id', [buyer])
  const price = site.billing.products.find(product => product.id === user.productId)!.priceUsd
  expect(rows).toEqual(Array.from({ length: form === 'subscription' ? 2 : 1 }, () => ({
    code_id: null, amount_discount: 0, amount_total: Math.round(price * 100) + 159, amount_tax: 159,
  })))
  const { rows: [row] } = await db.query('select public.checkout_discount($1,$2) as pending', [buyer, user.productId])
  expect(row.pending).toMatchObject({ code_id: offer.id })
})

// The provider controls coupon expiry. Each signed period carries the totals and expanded
// discounts actually reported for that period. A retained subscription metadata.code alone
// must never consume a redemption again or attribute an expired coupon to a renewal.
it.each([
  { duration: 'once', discounted: [true, false, false, false] },
  { duration: 'repeating', discounted: [true, true, false, false] },
  { duration: 'forever', discounted: [true, true, true, true] },
] as const)('records monthly totals and tax for $duration and grants the referral only on first payment', async ({ duration, discounted }) => {
  const { buyer, inviter } = await customer()
  const product = site.billing.products.find(p => p.id === 'starter_monthly')!
  const offer = await campaign(buyer, product.id, duration)
  const h = stripeHarness()
  const trackReward = vi.fn()
  h.deps.applyCodes = vi.fn(paymentCodeEffects(serviceSupabase(), invite, trackReward))
  const sub = subscriptionObject({ userId: buyer, productId: product.id, periodEndDays: 30 })
  sub.metadata = { ...sub.metadata, code: offer.code, code_id: offer.id }
  h.subscriptions.set(sub.id, sub)
  const subtotal = Math.round(product.priceUsd * 100)
  const deliver = (type: string, id: string) => handleStripeWebhook(h.deps, signed(eventFor(type, id)))
  for (const [period, isDiscounted] of discounted.entries()) {
    const amount = isDiscounted ? Math.round(subtotal * 0.2) : 0
    const net = subtotal - amount
    const tax = Math.round(net * 0.08)
    const invoice = invoiceObject({ subscription: sub, billingReason: period ? 'subscription_cycle' : 'subscription_create',
      amountPaid: net + tax, tax, periodEndDays: (period + 1) * 30 })
    invoice.subtotal = subtotal
    const discount = { id: 'di_example', source: { type: 'coupon', coupon: { metadata: { code_id: offer.id } } } } as unknown as Stripe.Discount
    invoice.discounts = isDiscounted ? [discount] : []
    invoice.total_discount_amounts = isDiscounted ? [{ amount, discount: discount.id }] : []
    h.invoices.set(invoice.id, invoice)
    if (!period) {
      const session = checkoutSession({ userId: buyer, productId: product.id, method: 'card', subscription: sub, invoice })
      session.metadata = { ...session.metadata, code_id: offer.id, code: offer.code }
      session.amount_total = net + tax
      session.total_details = { amount_discount: amount, amount_tax: tax, amount_shipping: 0 }
      h.sessions.set(session.id, session)
      expect((await deliver('checkout.session.completed', session.id)).body.outcome).toBe('applied')
    }
    expect((await deliver('invoice.paid', invoice.id)).body.outcome).toBe(period ? 'applied' : 'ignored')
    if (period) expect((await deliver('invoice.paid', invoice.id)).body.outcome).toBe('replayed')
    const { rows: [payment] } = await db.query('select amount_total,amount_tax,code_id,amount_discount from payments where stripe_invoice_id=$1', [invoice.id])
    expect(payment).toEqual({ amount_total: net + tax, amount_tax: tax, code_id: period ? null : offer.id, amount_discount: period ? 0 : amount })
    const purchase = h.trackBuy.mock.lastCall?.[1]
    expect(purchase.amount_usd).toBeCloseTo(net / 100)
    expect(purchase.code).toBe(isDiscounted ? offer.code : undefined)
    expect(purchase.amount_discount_usd).toBe(isDiscounted ? amount / 100 : undefined)
  }
  expect(h.trackBuy).toHaveBeenCalledTimes(discounted.length)
  expect(h.deps.applyCodes).toHaveBeenCalledTimes(1)
  expect(trackReward).toHaveBeenCalledExactlyOnceWith(inviter, { credits: seededRewards.inviterCredits, product_id: product.id }, 'en')
})
