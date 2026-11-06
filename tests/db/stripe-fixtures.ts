import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import Stripe from 'stripe'
import { vi } from 'vitest'

import type { ProductId } from '@/core/config'
import { lookupKey, priceCents, type CheckoutMethod, type StripeApi, type WebhookDeps } from '@/core/billing/stripe'
import { site } from '@/site/site.config'

import { serviceSupabase } from './supabase-env'

// Signed fake webhooks (AGENTS §7 test 2): the real SDK signs and verifies, and the Stripe API
// is a set of object maps the test controls (what `retrieve` answers), so the database side
// runs for real.

export const WEBHOOK_SECRET = `whsec_test_${randomUUID().replaceAll('-', '')}`
const sdk = new Stripe('sk_test_unused')
const uid = () => randomUUID().replaceAll('-', '')
const now = () => Math.floor(Date.now() / 1000)
export const DAY_S = 24 * 60 * 60

function store<T>(kind: string) {
  const map = new Map<string, T>()
  const retrieve = vi.fn(async (id: string) => {
    const found = map.get(id)
    if (!found) throw new Error(`no such ${kind} ${id}`)
    return structuredClone(found)
  })
  return { map, retrieve }
}

export function stripeHarness() {
  const sessions = store<Stripe.Checkout.Session>('session')
  const invoices = store<Stripe.Invoice>('invoice')
  const subscriptions = store<Stripe.Subscription>('subscription')
  const charges = store<Stripe.Charge>('charge')
  const disputes = store<Stripe.Dispute>('dispute')
  const stripe = {
    webhooks: sdk.webhooks,
    checkout: { sessions: { retrieve: sessions.retrieve, create: vi.fn() } },
    prices: { list: vi.fn() },
    invoices: { retrieve: invoices.retrieve },
    subscriptions: { retrieve: subscriptions.retrieve },
    charges: { retrieve: charges.retrieve },
    disputes: { retrieve: disputes.retrieve },
    billingPortal: { sessions: { create: vi.fn() } },
  } as unknown as StripeApi
  const trackBuy = vi.fn()
  const deps: WebhookDeps = {
    stripe,
    db: serviceSupabase(),
    products: site.billing.products,
    webhookSecret: WEBHOOK_SECRET,
    trackBuy,
  }
  return {
    deps,
    trackBuy,
    sessions: sessions.map,
    retrieve: sessions.retrieve,
    invoices: invoices.map,
    subscriptions: subscriptions.map,
    charges: charges.map,
    disputes: disputes.map,
    stripe,
  }
}

export type Harness = ReturnType<typeof stripeHarness>

function product(productId: ProductId) {
  const found = site.billing.products.find((p) => p.id === productId)
  if (!found) throw new Error(productId)
  return found
}

function price(productId: ProductId, form: 'subscription' | 'one_time', metadataProductId?: string) {
  return {
    id: `price_${productId}_${form}`,
    object: 'price',
    lookup_key: lookupKey(productId, form),
    metadata: { product_id: metadataProductId ?? productId },
  }
}

type SubscriptionInput = {
  periodEndDays: number
  cancelAtPeriodEnd?: boolean
  status?: Stripe.Subscription.Status
  // Renewal tests: who and what (T9 puts these in subscription_data.metadata at checkout).
  userId?: string
  productId?: ProductId
  priceProductId?: string
}

export function subscriptionObject(input: SubscriptionInput) {
  const item = {
    id: 'si_1',
    current_period_end: now() + input.periodEndDays * DAY_S,
    price: input.productId ? price(input.productId, 'subscription', input.priceProductId) : undefined,
  }
  return {
    id: `sub_${uid()}`,
    object: 'subscription',
    customer: `cus_${uid()}`,
    status: input.status ?? 'active',
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    metadata: input.userId ? { user_id: input.userId, product_id: input.productId, method: 'card' } : {},
    items: { object: 'list', data: [item] },
  } as unknown as Stripe.Subscription
}

export function chargeObject(input: { amount: number; method?: string; refunded?: number }) {
  const prefix = input.method === 'alipay' ? 'py' : 'ch'
  return {
    id: `${prefix}_${uid()}`,
    object: 'charge',
    amount: input.amount,
    amount_refunded: input.refunded ?? 0,
    payment_method_details: { type: input.method ?? 'card' },
  } as unknown as Stripe.Charge
}

type InvoiceInput = {
  subscription: Stripe.Subscription
  billingReason?: Stripe.Invoice.BillingReason
  status?: Stripe.Invoice.Status
  amountPaid: number
  tax?: number
  periodEndDays: number
  chargeId?: string | null
  currency?: string
}

// An invoice as retrieved with payments.data.payment.payment_intent expanded.
export function invoiceObject(input: InvoiceInput): Stripe.Invoice {
  const chargeId = input.chargeId === undefined ? `ch_${uid()}` : input.chargeId
  return {
    id: `in_${uid()}`,
    object: 'invoice',
    billing_reason: input.billingReason ?? 'subscription_cycle',
    status: input.status ?? 'paid',
    amount_paid: input.amountPaid,
    currency: input.currency ?? 'usd',
    total_taxes: input.tax ? [{ amount: input.tax }] : [],
    // invoice.period_end is the window just closed; the paid period is on the line.
    period_end: now(),
    parent: { type: 'subscription_details', subscription_details: { subscription: input.subscription.id, metadata: input.subscription.metadata } },
    lines: {
      object: 'list',
      data: [{ id: 'il_1', parent: { type: 'subscription_item_details' }, period: { start: now(), end: now() + input.periodEndDays * DAY_S } }],
    },
    payments: {
      object: 'list',
      data: chargeId ? [{ id: 'inpay_1', status: 'paid', payment: { type: 'payment_intent', payment_intent: { id: `pi_${uid()}`, latest_charge: chargeId } } }] : [],
    },
  } as unknown as Stripe.Invoice
}

type SessionInput = {
  userId: string
  productId: ProductId
  method: CheckoutMethod
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus
  subscription?: Stripe.Subscription
  // Subscription mode: the first invoice (retrieved separately for its charge).
  invoice?: Stripe.Invoice
  // One-time mode: the expanded PaymentIntent's latest charge.
  charge?: Stripe.Charge
  tax?: number
  // Tampering: what the charged Price says it is, if not the product bought.
  priceProductId?: string
  clientReferenceId?: string
}

// A session as Stripe returns it with line_items.data.price, subscription and
// payment_intent.latest_charge expanded.
export function checkoutSession(input: SessionInput): Stripe.Checkout.Session {
  const cents = priceCents(product(input.productId))
  const mode = input.subscription ? 'subscription' : 'payment'
  const tax = input.tax ?? 0
  return {
    id: `cs_test_${uid()}`,
    object: 'checkout.session',
    mode,
    payment_status: input.paymentStatus ?? 'paid',
    client_reference_id: input.clientReferenceId ?? input.userId,
    metadata: { user_id: input.userId, product_id: input.productId, method: input.method },
    amount_subtotal: cents,
    amount_total: cents + tax,
    total_details: { amount_tax: tax },
    currency: 'usd',
    line_items: {
      object: 'list',
      data: [{ id: 'li_1', price: price(input.productId, mode === 'subscription' ? 'subscription' : 'one_time', input.priceProductId) }],
    },
    subscription: input.subscription ?? null,
    invoice: input.invoice?.id ?? null,
    payment_intent: mode === 'payment' ? { id: `pi_${uid()}`, latest_charge: input.charge ?? null } : null,
  } as unknown as Stripe.Checkout.Session
}

export function eventFor(type: string, objectId: string, id = `evt_${uid()}`) {
  return {
    id,
    object: 'event',
    type,
    api_version: '2026-09-30.endive',
    created: now(),
    livemode: false,
    data: { object: { id: objectId } },
  }
}

export function signed(event: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event)
  return { body, signature: sdk.webhooks.generateTestHeaderString({ payload: body, secret }) }
}

// Rows the T10 tests assert on, read with the admin connection.
export async function paymentsOf(db: Client, userId: string) {
  const { rows } = await db.query<{
    product_id: string
    channel: string
    stripe_session_id: string | null
    stripe_invoice_id: string | null
    stripe_charge_id: string | null
    amount_total: number
    amount_tax: number
    amount_refunded: number
    currency: string
    method: string
    status: string
  }>(
    `select product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id, amount_total, amount_tax,
            amount_refunded, currency, method, status
       from public.payments where user_id = $1 order by id`,
    [userId],
  )
  return rows
}

export async function mirrorOf(db: Client, userId: string) {
  const { rows } = await db.query<{
    stripe_subscription_id: string
    product_id: string
    status: string
    current_period_end: Date
    cancel_at_period_end: boolean
  }>(
    'select stripe_subscription_id, product_id, status, current_period_end, cancel_at_period_end from public.subscriptions where user_id = $1',
    [userId],
  )
  return rows
}
