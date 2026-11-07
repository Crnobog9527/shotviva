import 'server-only'

import type Stripe from 'stripe'

import { AppError } from '../../errors'
import type { CheckoutMethod, RecordedMethod } from './catalog'
import type { StripeApi } from './client'

// What a payments row records (TASKS T10), read from objects the webhook just retrieved from
// Stripe, never from the event body or the client. Amounts are in the smallest currency unit;
// with Adaptive Pricing the currency can be the buyer's, not USD.
export type PaymentFacts = {
  amountTotal: number
  amountTax: number
  currency: string
  method: RecordedMethod
  invoiceId: string | null
  chargeId: string | null
}

// The session retrieve expands these so a one-time payment's charge comes back in one call.
export const SESSION_EXPAND = ['line_items.data.price', 'subscription', 'payment_intent.latest_charge']
// An invoice's charge sits on its PaymentIntent; latest_charge stays an id at this depth.
export const INVOICE_EXPAND = ['payments.data.payment.payment_intent']

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null)

// What payments.method holds (ARCHITECTURE §6.1): `card` is the Managed Payments card group
// (海外银行卡), `cn_card` the plain Stripe card route (中国银行卡, T64), `alipay` / `wechat_pay`
// the wallet that paid on the wallet route (T73).
export type { RecordedMethod }

// A card charge records the card route it went through, read from our own checkout metadata
// (the session's for a first payment, the subscription's for a renewal).
export function cardRouteOf(method: unknown): 'card' | 'cn_card' {
  return method === 'cn_card' ? 'cn_card' : 'card'
}

// The wallets sold are Alipay and WeChat Pay (§6.2, T73), both on the one wallet checkout, so
// the charge says which the buyer chose there. Every other method Managed Payments offers
// (card, Apple / Google Pay, Link) belongs to the card group of the route the session was
// opened on. With no charge to read, the picked route stands (the wallet line reads `alipay`).
export function methodOfCharge(charge: Stripe.Charge | null, picked: CheckoutMethod): RecordedMethod {
  const type = charge?.payment_method_details?.type
  if (!type) return picked
  if (type === 'alipay' || type === 'wechat_pay') return type
  return cardRouteOf(picked)
}

function expandedCharge(intent: string | Stripe.PaymentIntent | null): Stripe.Charge | null {
  if (!intent || typeof intent === 'string') return null
  const charge = intent.latest_charge
  return charge && typeof charge === 'object' ? charge : null
}

export function invoiceChargeId(invoice: Stripe.Invoice): string | null {
  const paid = (invoice.payments?.data ?? []).find((p) => p.status === 'paid') ?? null
  if (!paid) return null
  if (paid.payment.charge) return idOf(paid.payment.charge)
  const intent = paid.payment.payment_intent
  return intent && typeof intent === 'object' ? idOf(intent.latest_charge) : null
}

export function invoiceTax(invoice: Stripe.Invoice): number {
  return (invoice.total_taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0)
}

// Subscriptions are card-only (neither wallet can subscribe, §6.3): an invoice is paid by the card
// route its subscription was opened on (`subscriptionMethod`, the subscription's metadata).
export function invoiceFacts(invoice: Stripe.Invoice, subscriptionMethod: unknown): PaymentFacts {
  return {
    amountTotal: invoice.amount_paid,
    amountTax: invoiceTax(invoice),
    currency: invoice.currency,
    method: cardRouteOf(subscriptionMethod),
    invoiceId: invoice.id,
    chargeId: invoiceChargeId(invoice),
  }
}

// A subscription's first payment is its first invoice; a one-time payment is its PaymentIntent.
export async function sessionFacts(
  stripe: StripeApi,
  session: Stripe.Checkout.Session,
  picked: CheckoutMethod,
): Promise<PaymentFacts> {
  if (session.amount_total === null || !session.currency) {
    throw new AppError('INVALID_INPUT', `checkout session ${session.id}: no amount`)
  }
  const base = {
    amountTotal: session.amount_total,
    amountTax: session.total_details?.amount_tax ?? 0,
    currency: session.currency,
  }
  const invoiceId = idOf(session.invoice)
  if (session.mode === 'subscription' && invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: INVOICE_EXPAND })
    return { ...base, method: cardRouteOf(picked), invoiceId, chargeId: invoiceChargeId(invoice) }
  }
  const charge = expandedCharge(session.payment_intent)
  return { ...base, method: methodOfCharge(charge, picked), invoiceId, chargeId: charge?.id ?? null }
}
