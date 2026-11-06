import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { creditChangeSchema } from '../credits'
import { callRpc } from '../rpc'
import { lookupKey } from './catalog'
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
function readOwner(invoiceId: string, sub: Stripe.Subscription, products: readonly SiteProduct[]) {
  const meta = ownerSchema.safeParse(sub.metadata ?? {})
  if (!meta.success) throw invalid(invoiceId, 'subscription metadata')
  const product = products.find((p) => p.id === meta.data.product_id)
  if (!product || product.tier === 'pack') throw invalid(invoiceId, 'unknown product')
  if (!pricedAs(sub, product.id)) throw invalid(invoiceId, 'subscription price')
  return { userId: meta.data.user_id, product }
}

function pricedAs(sub: Stripe.Subscription, productId: SiteProduct['id']): boolean {
  const items = sub.items.data
  const price = items.length === 1 ? items[0]?.price : undefined
  return price?.metadata?.product_id === productId && price.lookup_key === lookupKey(productId, 'subscription')
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
  const invoice = await deps.stripe.invoices.retrieve(invoiceId, { expand: INVOICE_EXPAND })
  if (invoice.billing_reason !== 'subscription_cycle') return 'ignored'
  if (invoice.status !== 'paid') return 'unpaid'
  const sub = await deps.stripe.subscriptions.retrieve(subscriptionIdOf(invoice))
  const { userId, product } = readOwner(invoice.id, sub, deps.products)
  const facts = invoiceFacts(invoice)
  const change = await callRpc(
    deps.db,
    'apply_subscription_renewal',
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
    method: 'card',
    // List price in USD: with Adaptive Pricing the invoice may be in the buyer's currency.
    amount_usd: product.priceUsd,
    credits: product.credits,
  }, sub.metadata?.locale === 'zh' ? 'zh' : 'en')
  return 'applied'
}
