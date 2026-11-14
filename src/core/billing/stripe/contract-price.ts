import 'server-only'
import type Stripe from 'stripe'
import { z } from 'zod'

import { AppError } from '../../errors'
import type { SiteProduct } from '../../config'
import { readQuote } from '../read-quote'
import { callRpc, type RpcClient } from '../rpc'
import { lookupKey, stripeProductId, type CheckoutForm } from './catalog'

export async function legacyPrice(
  db: RpcClient,
  price: Stripe.Price,
  product: SiteProduct,
  form: CheckoutForm,
  metadata: Stripe.Metadata,
) {
  const quote = readQuote(metadata, product)
  if (!quote || !exactShape(price, product, form) || price.unit_amount !== quote.cents) return false
  return callRpc(
    db,
    'catalog_legacy_price',
    { p_product: product.id, p_key: lookupKey(product.id, form, quote), p_price: price.id },
    z.boolean(),
  )
}

export function exactShape(price: Stripe.Price, product: SiteProduct, form: CheckoutForm) {
  const id = typeof price.product === 'string' ? price.product : price.product.id
  if (price.currency !== 'usd' || price.metadata?.product_id !== product.id || id !== stripeProductId(product)) return false
  if (form === 'one_time') return price.type === 'one_time'
  const recurring = price.recurring
  return (
    price.type === 'recurring' && recurring !== null && recurring.interval === product.interval && recurring.interval_count === 1
  )
}

// Stripe rounds a coupon in the checkout currency's own minor units. A JPY receipt
// can round to a different USD cent if its total is converted back by a simple ratio.
export function netUsd(
  cents: number,
  paid: number | null,
  tax: number,
  subtotal: number | null,
  currency: string | null,
  discountPercent: string,
) {
  if (paid == null || subtotal == null || subtotal <= 0 || !currency)
    throw new AppError('INVALID_INPUT', 'Missing collected amount')
  if (currency === 'usd') return paid - tax
  const percent = Number(discountPercent)
  if (!Number.isInteger(percent) || percent < 0 || percent > 90) throw new AppError('INVALID_INPUT', 'Invalid frozen coupon')
  const afterDiscount = (list: number) => list - Math.round((list * percent) / 100)
  if (paid - tax !== afterDiscount(subtotal)) throw new AppError('INVALID_INPUT', 'Localized amount differs from the contract')
  return afterDiscount(cents)
}
