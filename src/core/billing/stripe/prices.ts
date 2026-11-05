import 'server-only'

import type Stripe from 'stripe'

import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { STRIPE_TAX_CODE, priceCents, type CheckoutRoute } from './catalog'
import type { StripeApi } from './client'

// Prices are found by lookup_key (ARCHITECTURE §6.2), never by an id in code or config. A
// Price that disagrees with site.config is refused rather than sold: the page would show one
// amount and Stripe would charge another.

// Per function instance. A Price never changes amount (Stripe makes them immutable), so the only
// staleness is an archived Price, which Checkout then rejects loudly.
const cache = new Map<string, string>()

function taxCodeOf(price: Stripe.Price): string | null {
  const product = price.product
  if (typeof product === 'string' || 'deleted' in product) return null
  const code = product.tax_code
  return typeof code === 'string' ? code : (code?.id ?? null)
}

function billingMismatch(price: Stripe.Price, product: SiteProduct, route: CheckoutRoute): string | null {
  if (price.currency !== 'usd' || price.unit_amount !== priceCents(product)) return 'amount'
  const recurring = route.form === 'subscription'
  if (recurring !== (price.type === 'recurring')) return 'type'
  if (recurring && price.recurring?.interval !== product.interval) return 'interval'
  return null
}

function mismatch(price: Stripe.Price, product: SiteProduct, route: CheckoutRoute): string | null {
  if (price.metadata?.product_id !== product.id) return 'metadata.product_id'
  const billing = billingMismatch(price, product, route)
  if (billing) return billing
  // Managed Payments refuses a Product without its tax code; say so before Checkout does.
  if (route.managedPayments && taxCodeOf(price) !== STRIPE_TAX_CODE) return 'tax_code'
  return null
}

export async function resolvePriceId(stripe: StripeApi, product: SiteProduct, route: CheckoutRoute): Promise<string> {
  const cacheKey = `${route.lookupKey}:${route.managedPayments}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const { data } = await stripe.prices.list({ lookup_keys: [route.lookupKey], active: true, expand: ['data.product'] })
  const [price] = data
  if (!price || data.length !== 1) {
    throw new AppError('INTERNAL', `Stripe price ${route.lookupKey} not found; run scripts/stripe-setup.ts`)
  }
  const wrong = mismatch(price, product, route)
  if (wrong) throw new AppError('INTERNAL', `Stripe price ${route.lookupKey} disagrees with site.config (${wrong})`)
  cache.set(cacheKey, price.id)
  return price.id
}

// Tests reset between fixtures.
export function clearPriceCache(): void {
  cache.clear()
}
