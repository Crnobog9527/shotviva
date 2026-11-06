import 'server-only'

import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import type { ProductId, SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { creditChangeSchema, type CreditChange } from '../credits'
import { callRpc, type RpcClient } from '../rpc'
import { paymentFacts, readWaffoOrder, type WaffoPaymentFacts } from './payment-facts'

// A verified order.completed becomes exactly one settle_waffo_order (0200): apply_purchase keyed
// by Waffo's event id (the payment id, `PAY_…`) plus the payments row (T10, channel 'waffo'), in
// one transaction, so every redelivery grants once and records once. The same apply_purchase as
// every Stripe purchase: the credit logic is not forked. The ledger key `purchase:PAY_…` is what
// admin_revenue_stats reads as the Waffo channel.

export type WaffoFulfilDeps = {
  // Service-role client: settle_waffo_order is not callable by the client roles.
  db: RpcClient
  products: readonly SiteProduct[]
  trackBuy?: typeof trackPurchase
}

export type WaffoFulfilOutcome = 'applied' | 'replayed' | 'unpaid'

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

// The page language the checkout was opened in, carried in the order metadata.
function track(deps: WaffoFulfilDeps, userId: string, product: SiteProduct, facts: WaffoPaymentFacts, locale: 'en' | 'zh'): void {
  ;(deps.trackBuy ?? trackPurchase)(userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: 'one_time',
    channel: 'waffo',
    method: facts.method,
    amount_usd: facts.subtotalUsd,
    credits: product.credits,
  }, locale)
}

export async function fulfilWaffoOrder(
  deps: WaffoFulfilDeps,
  event: { eventId: string; data: unknown },
): Promise<WaffoFulfilOutcome> {
  const order = readWaffoOrder(event.eventId, event.data)
  if (order.paymentStatus !== undefined && order.paymentStatus !== 'succeeded') return 'unpaid'
  const { user_id: userId, product_id: productId, locale } = order.orderMetadata
  const product = deps.products.find((p) => p.id === productId)
  if (!product) throw new AppError('INVALID_INPUT', `waffo order ${event.eventId}: unknown product`)
  const facts = paymentFacts(order, product)
  const change = await settleWaffoOrder(deps.db, { userId, productId, paymentId: event.eventId, facts })
  if (!change.applied) return 'replayed'
  track(deps, userId, product, facts, locale)
  return 'applied'
}
