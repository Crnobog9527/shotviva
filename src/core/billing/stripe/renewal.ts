import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import { AppError } from '../../errors'
import { readQuote } from '../read-quote'
import { creditChangeSchema } from '../credits'
import { callRpc } from '../rpc'
import { matchesContractPrice } from './prices'
import { renewalAmounts } from './discount-facts'
import type { FulfilDeps } from './fulfil'
import { INVOICE_EXPAND, invoiceFacts } from './payment-facts'

// Renewals (ARCHITECTURE §6.1, §6.2): invoice.paid with billing_reason = subscription_cycle
// becomes one apply_subscription_renewal, keyed by the invoice id. The first invoice
// (subscription_create) was already granted through its Checkout Session, and every other
// reason (manual, update, …) grants nothing. A failed renewal sends no invoice.paid, so it
// does nothing: no credits, paid_until not extended (§6.2 "续费失败：什么都不做").

export type RenewalOutcome = 'applied' | 'replayed' | 'ignored' | 'unpaid'

const ownerSchema = z.object({ user_id: z.uuid(), product_id: z.string() })

function invalid(id: string, what: string): AppError {
  return new AppError('INVALID_INPUT', `invoice ${id}: ${what}`)
}

function subscriptionIdOf(invoice: Stripe.Invoice): string {
  const sub = invoice.parent?.subscription_details?.subscription
  const id = typeof sub === 'string' ? sub : sub?.id
  if (!id) throw invalid(invoice.id, 'no subscription')
  return id
}

// The subscription's metadata (set at checkout, T9) says who and what; the subscribed Price's
// metadata and lookup key must agree, so a renewal never grants another product.
async function readOwner(invoice: Stripe.Invoice, sub: Stripe.Subscription, deps: FulfilDeps) {
  const metadata = invoice.parent?.subscription_details?.metadata ?? sub.metadata
  const meta = ownerSchema.safeParse(metadata)
  if (!meta.success) throw invalid(invoice.id, 'subscription metadata')
  const product = deps.products.find(p => p.id === meta.data.product_id)
  if (!product || product.tier === 'pack') throw invalid(invoice.id, 'unknown product')
  const quote = readQuote(metadata, product)
  const price = await billedPrice(invoice, sub, deps, !!quote)
  if (!price || !matchesContractPrice(price, product, 'subscription', quote)) throw invalid(invoice.id, 'subscription price')
  return { userId: meta.data.user_id, product, quote, metadata, price }
}

function completeLine(lines: Stripe.InvoiceLineItem[], hasMore: boolean): boolean {
  const line = lines[0]
  return lines.length === 1 && !hasMore && !!line?.pricing?.price_details?.price && line.quantity === 1
}

async function billedPrice(invoice: Stripe.Invoice, sub: Stripe.Subscription, deps: FulfilDeps, versioned: boolean) {
  const lines = invoice.lines.data.filter(l => l.parent?.type === 'subscription_item_details')
  const line = lines[0]
  const billed = line?.pricing?.price_details?.price
  if (versioned && !completeLine(lines, invoice.lines.has_more)) throw invalid(invoice.id, 'incomplete subscription line')
  const item = sub.items.data.length === 1 ? sub.items.data[0] : undefined
  // Replayed after the subscription changed: the invoice's frozen Price is authoritative.
  return resolveBilled(deps, billed, item?.price)
}

function resolveBilled(deps: FulfilDeps, billed?: string | Stripe.Price, current?: Stripe.Price) {
  if (!billed) return current
  if (typeof billed !== 'string') return billed
  return billed === current?.id ? current : deps.stripe.prices.retrieve(billed)
}

// The period this invoice pays for is on its subscription line, not invoice.period_end (that
// is the window for pending items, i.e. the period just ended).
function periodEndOf(invoice: Stripe.Invoice): Date {
  const lines = invoice.lines.data
  const line = lines.find((l) => l.parent?.type === 'subscription_item_details') ?? lines[0]
  if (!line) throw invalid(invoice.id, 'no lines')
  return new Date(line.period.end * 1000)
}

export async function renewFromInvoice(deps: FulfilDeps, invoiceId: string): Promise<RenewalOutcome> {
  const invoice = await deps.stripe.invoices.retrieve(invoiceId, { expand: [...INVOICE_EXPAND, 'discounts.source.coupon'] })
  if (invoice.billing_reason !== 'subscription_cycle') return 'ignored'
  if (invoice.status !== 'paid') return 'unpaid'
  const sub = await deps.stripe.subscriptions.retrieve(subscriptionIdOf(invoice))
  const { userId, product, quote, metadata, price } = await readOwner(invoice, sub, deps)
  const facts = invoiceFacts(invoice, metadata.method)
  const change = await callRpc(
    deps.db,
    quote ? 'apply_subscription_renewal_v2' : 'apply_subscription_renewal',
    {
      p_user_id: userId,
      p_product_id: product.id,
      p_invoice_id: invoice.id,
      p_period_end: periodEndOf(invoice).toISOString(),
      p_amount_total: facts.amountTotal,
      p_amount_tax: facts.amountTax,
      p_currency: facts.currency,
      p_method: facts.method,
      p_charge_id: facts.chargeId,
    },
    creditChangeSchema,
  )
  if (!change.applied) return 'replayed'
  ;(deps.trackBuy ?? trackPurchase)(userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: 'subscription',
    channel: 'stripe',
    // The card route the subscription was opened on: a 中国银行卡 subscription renews as cn_card.
    method: facts.method,
    ...renewalAmounts(invoice, metadata, price, product),
    ...(quote && { credits: quote.credits }),
  }, metadata.locale === 'zh' ? 'zh' : 'en')
  return 'applied'
}
