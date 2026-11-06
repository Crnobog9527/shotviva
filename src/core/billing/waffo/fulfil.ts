import 'server-only'

import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import { PRODUCT_IDS, type SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { applyPurchase } from '../credits'
import type { RpcClient } from '../rpc'
import type { CheckoutMethod } from '../stripe/catalog'

// A verified order.completed becomes exactly one apply_purchase (ARCHITECTURE §6.1), keyed by
// Waffo's event id (the payment id, `PAY_…`), so every redelivery grants once. The same SQL
// function as every Stripe purchase: the credit logic is not forked. The ledger key
// `purchase:PAY_…` is what admin_revenue_stats reads as the Waffo channel.

export type WaffoFulfilDeps = {
  // Service-role client: apply_purchase is not callable by the client roles.
  db: RpcClient
  products: readonly SiteProduct[]
  trackBuy?: typeof trackPurchase
}

export type WaffoFulfilOutcome = 'applied' | 'replayed' | 'unpaid'

// orderMetadata is documented as an object; accept a JSON string too rather than drop a payment.
function fromJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const metadataSchema = z.preprocess(fromJson, z.object({ user_id: z.uuid(), product_id: z.enum(PRODUCT_IDS) }))

const money = z.string().regex(/^\d+(\.\d{1,2})?$/)

const orderSchema = z.object({
  orderMetadata: metadataSchema,
  paymentStatus: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentMethodBrand: z.string().optional(),
  listPrice: z.object({ subtotal: money.optional() }).optional(),
})
type WaffoOrder = z.infer<typeof orderSchema>

function readOrder(eventId: string, data: unknown): WaffoOrder {
  const order = orderSchema.safeParse(data)
  if (!order.success) throw new AppError('INVALID_INPUT', `waffo order ${eventId}: metadata`)
  return order.data
}

// The method Waffo actually charged, not the one picked on the paywall.
export function chargedMethod(order: Pick<WaffoOrder, 'paymentMethod' | 'paymentMethodBrand'>): CheckoutMethod {
  const brand = `${order.paymentMethod ?? ''} ${order.paymentMethodBrand ?? ''}`.toLowerCase()
  return brand.includes('alipay') ? 'alipay' : 'card'
}

function track(deps: WaffoFulfilDeps, userId: string, product: SiteProduct, order: WaffoOrder): void {
  const subtotal = order.listPrice?.subtotal
  ;(deps.trackBuy ?? trackPurchase)(userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: 'one_time',
    channel: 'waffo',
    method: chargedMethod(order),
    // Before tax, like the Stripe event.
    amount_usd: subtotal ? Number(subtotal) : product.priceUsd,
    credits: product.credits,
  })
}

export async function fulfilWaffoOrder(
  deps: WaffoFulfilDeps,
  event: { eventId: string; data: unknown },
): Promise<WaffoFulfilOutcome> {
  const order = readOrder(event.eventId, event.data)
  if (order.paymentStatus !== undefined && order.paymentStatus !== 'succeeded') return 'unpaid'
  const { user_id: userId, product_id: productId } = order.orderMetadata
  const product = deps.products.find((p) => p.id === productId)
  if (!product) throw new AppError('INVALID_INPUT', `waffo order ${event.eventId}: unknown product`)
  const change = await applyPurchase(deps.db, { userId, productId, eventId: event.eventId })
  if (!change.applied) return 'replayed'
  track(deps, userId, product, order)
  return 'applied'
}
