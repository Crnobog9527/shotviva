import { z } from 'zod'

import { productIdSchema, type SiteProduct } from '../../config'
import { AppError } from '../../errors'
import type { CheckoutPrice } from '../checkout-price'
import type { CheckoutMethod } from '../stripe/catalog'

// What a signed order.completed says was bought and paid (docs.waffo.ai "Webhooks", data
// fields). Who and what come from the order metadata our checkout set with the API key; the
// amounts are Waffo's display strings ("21.49"), turned into cents for payments (T10).

function fromJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// orderMetadata is documented as an object; accept a JSON string too rather than drop a payment.
// `locale` is analytics only (ARCHITECTURE §16.2); orders created before T21 have none.
export const metadataSchema = z.preprocess(
  fromJson,
  z.object({ user_id: z.uuid(), product_id: productIdSchema,
    catalog_revision:z.string().optional(), catalog_attempt:z.string().optional(), catalog_price:z.string().optional(),
    quoted_credits: z.string().optional(), pricing_version: z.string().optional(), quoted_usd_cents: z.string().optional(), pack_member_tier: z.string().optional(),
    locale: z.enum(['en', 'zh']).catch('en').default('en') }),
)
const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/)

const orderSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().optional(),
  orderMetadata: metadataSchema,
  orderMerchantExternalId: z.string().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  paymentStatus: z.string().optional(),
  periodNumber: z.number().int().positive().optional(),
  // "2026-03-10": when the charge was taken, for refusing a charge on an order an upgrade ended (T66).
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentMethodBrand: z.string().optional(),
  // What the channel actually took, tax included; omitted when the channel reported none.
  chargedAmount: money.optional(),
  listPrice: z.object({ total: money.optional(), subtotal: money.optional(), taxAmount: money.optional() }).optional(),
})
export type WaffoOrder = z.infer<typeof orderSchema>

export type WaffoPaymentFacts = {
  orderId: string
  amountTotal: number
  amountTax: number
  currency: string
  method: CheckoutMethod
  // Before tax, for the PostHog purchase event (same basis as Stripe's).
  subtotalUsd: number
}

export function readWaffoOrder(eventId: string, data: unknown): WaffoOrder {
  const order = orderSchema.safeParse(data)
  if (!order.success) throw new AppError('INVALID_INPUT', `waffo order ${eventId}: metadata`)
  if (order.data.orderMerchantExternalId?.startsWith('v2_') && order.data.orderMetadata.pricing_version !== 'v2') throw new AppError('INVALID_INPUT', 'Missing Waffo order pricing version')
  return order.data
}

export function toCents(amount: string): number {
  const [whole = '0', fraction = ''] = amount.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

// The method Waffo actually charged, not the one picked on the paywall.
export function chargedMethod(order: Pick<WaffoOrder, 'paymentMethod' | 'paymentMethodBrand'>): CheckoutMethod {
  const brand = `${order.paymentMethod ?? ''} ${order.paymentMethodBrand ?? ''}`.toLowerCase()
  return brand.includes('alipay') ? 'alipay' : 'card'
}

const legacyAnnualCents: Partial<Record<SiteProduct['id'], number>> = { starter_yearly: 19100, pro_yearly: 47900, max_yearly: 71300 }

function legacyPriceCents(product: SiteProduct) {
  return legacyAnnualCents[product.id] ?? Math.round(product.priceUsd * 100)
}

// A legacy paid order is never refused for a missing amount: the site price stands in for it.
export function paymentFacts(order: WaffoOrder, product: SiteProduct, quote?: CheckoutPrice): WaffoPaymentFacts {
  const list = order.listPrice
  // Legacy signed notifications could omit totals. Keep the agreed v1 annual price on those retries.
  const fallback = legacyPriceCents(product)
  const total = order.chargedAmount ?? list?.total
  const amountTotal = total ? toCents(total) : fallback
  const amountTax = Math.min(list?.taxAmount ? toCents(list.taxAmount) : 0, amountTotal)
  const subtotal = list?.subtotal ? toCents(list.subtotal) : amountTotal - amountTax
  if (quote) verifyCharge(order, quote.cents, subtotal, amountTotal - amountTax)
  return {
    orderId: order.orderId,
    amountTotal,
    amountTax,
    currency: (order.currency ?? 'usd').toLowerCase(),
    method: chargedMethod(order),
    subtotalUsd: subtotal / 100,
  }
}

function verifyCharge(order: WaffoOrder, quoted: number, subtotal: number, net: number) {
  if (!order.chargedAmount || order.currency?.toLowerCase() !== 'usd') throw new AppError('INVALID_INPUT', 'Missing USD charge for quoted order')
  if (net !== quoted || subtotal !== quoted) throw new AppError('INVALID_INPUT', 'Paid Waffo amount differs from quoted price')
}
