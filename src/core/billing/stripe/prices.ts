import 'server-only'

import type Stripe from 'stripe'

import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { STRIPE_TAX_CODE, lookupKey, priceCents, stripeProductId, type CheckoutForm, type CheckoutRoute } from './catalog'
import type { CheckoutPrice } from '../checkout-price'
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

function billingMismatch(price: Stripe.Price, product: SiteProduct, route: CheckoutRoute, cents: number): string | null {
  if (price.currency !== 'usd' || price.unit_amount !== cents) return 'amount'
  const recurring = route.form === 'subscription'
  if (recurring !== (price.type === 'recurring')) return 'type'
  if (recurring && price.recurring?.interval !== product.interval) return 'interval'
  return null
}

function mismatch(price: Stripe.Price, product: SiteProduct, route: CheckoutRoute, cents: number): string | null {
  if (price.metadata?.product_id !== product.id) return 'metadata.product_id'
  const billing = billingMismatch(price, product, route, cents)
  if (billing) return billing
  // Managed Payments refuses a Product without its tax code; say so before Checkout does.
  if (route.managedPayments && taxCodeOf(price) !== STRIPE_TAX_CODE) return 'tax_code'
  return null
}

export async function resolvePriceId(stripe: StripeApi, product: SiteProduct, route: CheckoutRoute, cents = priceCents(product)): Promise<string> {
  const cacheKey = `${route.lookupKey}:${route.managedPayments}:${cents}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const { data } = await stripe.prices.list({ lookup_keys: [route.lookupKey], active: true, expand: ['data.product'] })
  const [price] = data
  if (!price || data.length !== 1) {
    throw new AppError('INTERNAL', `Stripe price ${route.lookupKey} not found; run scripts/stripe-setup.ts`)
  }
  const wrong = mismatch(price, product, route, cents)
  if (wrong) throw new AppError('INTERNAL', `Stripe price ${route.lookupKey} disagrees with site.config (${wrong})`)
  cache.set(cacheKey, price.id)
  return price.id
}

// Tests reset between fixtures.
export function clearPriceCache(): void {
  cache.clear()
}


// A Price can lose its lookup_key when an earlier setup transferred it to a replacement.
// Legacy contracts may still lawfully reference that archived, immutable Stripe Product/Price.
export function matchesContractPrice(price: Stripe.Price, product: SiteProduct, form: CheckoutForm, quote?: CheckoutPrice): boolean {
  if (price.metadata?.product_id !== product.id) return false
  if (quote && (price.unit_amount !== quote.cents || price.currency !== 'usd')) return false
  if (price.lookup_key === lookupKey(product.id, form, quote)) return true
  return !quote && matchesArchived(price, product, form)
}

function matchesArchived(price: Stripe.Price, product: SiteProduct, form: CheckoutForm) {
  if (price.active !== false || price.lookup_key !== null || price.currency !== 'usd') return false
  const stripeProduct = typeof price.product === 'string' ? price.product : price.product.id
  return stripeProduct === stripeProductId(product) && (form === 'subscription'
    ? price.type === 'recurring' && price.recurring?.interval === product.interval
    : price.type === 'one_time')
}
