import 'server-only'

import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import type { ProductId, SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { creditChangeSchema, type CreditChange } from '../credits'
import type { CancelOthers, CancelRefunded } from '../subscription/cancel-others'
import type { RefuseEnded } from '../subscription/ended-order'
import { callRpc, type RpcClient } from '../rpc'
import { paymentFacts, readWaffoOrder, type WaffoOrder, type WaffoPaymentFacts } from './payment-facts'
import { isoOf } from './subscription-sync'

// A verified order.completed or subscription.payment_succeeded becomes exactly one
// settle_waffo_order (0200, 0360): apply_purchase keyed by Waffo's event id (the payment id,
// `PAY_…`) plus the payments row (T10, channel 'waffo', one row per charge), in
// one transaction, so every redelivery grants once and records once. The same apply_purchase as
// every Stripe purchase: the credit logic is not forked. The ledger key `purchase:PAY_…` is what
// admin_revenue_stats reads as the Waffo channel.

export type WaffoFulfilDeps = {
  // Service-role client: settle_waffo_order is not callable by the client roles.
  db: RpcClient
  products: readonly SiteProduct[]
  trackBuy?: typeof trackPurchase
  // The upgrade step (T66, same as Stripe's): cancel the buyer's other renewing subscriptions.
  cancelOthers?: CancelOthers
  // T71: a refunded membership's own card subscription is cancelled. Wired by the webhook route.
  cancelRefunded?: CancelRefunded
  // T66: a charge on an order an upgrade already ended is refused (no credits, alert).
  refuseEnded?: RefuseEnded
}

// 'ended': a charge on an order an upgrade ended (T66); nothing granted, the Owner is alerted.
export type WaffoFulfilOutcome = 'applied' | 'replayed' | 'unpaid' | 'ended'

const inputSchema = z.object({ userId: z.uuid(), paymentId: z.string().min(1), orderId: z.string().min(1) })

export async function settleWaffoOrder(
  client: RpcClient,
  input: { userId: string; productId: ProductId; paymentId: string; facts: WaffoPaymentFacts },
): Promise<CreditChange> {
  const args = inputSchema.parse({ userId: input.userId, paymentId: input.paymentId, orderId: input.facts.orderId })
  return callRpc(
    client,
    'settle_waffo_order',
    {
      p_user_id: args.userId,
      p_product_id: input.productId,
      p_payment_id: args.paymentId,
      p_order_id: args.orderId,
      p_amount_total: input.facts.amountTotal,
      p_currency: input.facts.currency,
      p_amount_tax: input.facts.amountTax,
      p_method: input.facts.method,
    },
    creditChangeSchema,
  )
}

// One-time orders (order.completed) or a card subscription's charges (subscription.payment_succeeded).
export type WaffoChargeForm = 'one_time' | 'subscription'

// The page language the checkout was opened in, carried in the order metadata.
function track(deps: WaffoFulfilDeps, userId: string, product: SiteProduct, facts: WaffoPaymentFacts, meta: { locale: 'en' | 'zh'; form: WaffoChargeForm }): void {
  ;(deps.trackBuy ?? trackPurchase)(userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: meta.form,
    channel: 'waffo',
    method: facts.method,
    amount_usd: facts.subtotalUsd,
    credits: product.credits,
  }, meta.locale)
}

// Every successful Waffo charge grants once: a one-time order, a subscription's first payment and
// each renewal (T50) alike, keyed by the payment id (the eventId of both events). A failed
// renewal sends no payment event, so it grants nothing and paid_until stays.
export async function fulfilWaffoOrder(
  deps: WaffoFulfilDeps,
  event: { eventId: string; timestamp?: string; data: unknown },
  form: WaffoChargeForm = 'one_time',
): Promise<WaffoFulfilOutcome> {
  const order = readWaffoOrder(event.eventId, event.data)
  if (order.paymentStatus !== undefined && order.paymentStatus !== 'succeeded') return 'unpaid'
  if (await endedBefore(deps, order, form, event.timestamp)) return 'ended'
  const { user_id: userId, product_id: productId, locale } = order.orderMetadata
  const product = deps.products.find((p) => p.id === productId)
  if (!product) throw new AppError('INVALID_INPUT', `waffo order ${event.eventId}: unknown product`)
  const facts = paymentFacts(order, product)
  const change = await settleWaffoOrder(deps.db, { userId, productId, paymentId: event.eventId, facts })
  // A membership's charge (first payment or renewal): any other renewing subscription is the
  // plan this one upgraded from (T66). A renewal finds nothing to cancel. Replays too, as on Stripe.
  if (product.tier !== 'pack') await deps.cancelOthers?.(userId, { waffoOrderId: form === 'subscription' ? facts.orderId : null })
  if (!change.applied) return 'replayed'
  track(deps, userId, product, facts, { locale, form })
  return 'applied'
}

// A subscription charge taken after an upgrade ended its order. When it was taken: the event's
// own time, else its payment date; unknown → not refused.
async function endedBefore(deps: WaffoFulfilDeps, order: WaffoOrder, form: WaffoChargeForm, timestamp: string | undefined): Promise<boolean> {
  const at = isoOf(timestamp) ?? isoOf(order.paymentDate)
  if (form !== 'subscription' || !deps.refuseEnded || !at) return false
  return deps.refuseEnded({ orderId: order.orderId, at, what: 'charge' })
}
