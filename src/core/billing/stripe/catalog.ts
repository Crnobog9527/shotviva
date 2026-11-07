import type { MembershipTier, PaymentChannel, ProductId, SiteProduct } from '../../config'

// The Stripe side of the nine products (ARCHITECTURE §6.2 "Stripe Product / Price 映射", §6.3).
// Pure: the checkout route, the webhook and scripts/stripe-setup.ts all derive from here, so
// the lookup keys the setup script creates are exactly the ones checkout asks for.
// No server-only import: the setup script runs this under tsx.

// AI services, personal use. Managed Payments requires a tax code on every Product.
export const STRIPE_TAX_CODE = 'txcd_10105001'

// What the buyer picked on the paywall (no WeChat Pay, §6.2). `card` is the Managed Payments
// route ("Card · Apple Pay · Google Pay", on zh pages 海外银行卡); `cn_card` is the plain Stripe
// card route for Chinese-issued cards, which Managed Payments refuses (T64).
export const CHECKOUT_METHODS = ['card', 'alipay', 'cn_card'] as const
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number]

// The methods a page offers, in the order it lists them (ARCHITECTURE §6.3 「中文页付款方式」):
// zh pages on Stripe lead with 中国银行卡, then Alipay, then the Managed Payments card; English
// pages and Waffo (which takes Chinese cards itself) keep the card and Alipay. The paywall lists
// exactly these, and checkout refuses anything else, so a request cannot reach a route its page
// never showed. `locale` is the page's next-intl locale or the checkout body's.
export function offeredMethods(channel: PaymentChannel, locale: string): readonly [CheckoutMethod, ...CheckoutMethod[]] {
  return channel === 'stripe' && locale.startsWith('zh') ? ['cn_card', 'alipay', 'card'] : ['card', 'alipay']
}

export type CheckoutForm = 'subscription' | 'one_time'

// One-time Prices use the product id; subscription Prices add `_recurring`.
export function lookupKey(productId: ProductId, form: CheckoutForm): string {
  return form === 'subscription' ? `${productId}_recurring` : productId
}

// Fixed Stripe Product ids, so the setup script can find its own Products without a search:
// one per membership tier (four Prices each), one per pack (one Price).
export function stripeProductId(product: SiteProduct): string {
  return product.tier === 'pack' ? `shotviva_${product.id}` : `shotviva_${product.tier}`
}

const TIER_NAMES: Record<MembershipTier, string> = { starter: 'Starter', pro: 'Pro', max: 'Max' }
const PACK_NAMES: Partial<Record<ProductId, string>> = { pack_s: 'S', pack_m: 'M', pack_l: 'L' }

// Shown on the Stripe checkout page and receipts; not site copy, so not in next-intl.
export function stripeProductName(product: SiteProduct, brand: string): string {
  if (product.tier === 'pack') return `${brand} Credit Pack ${PACK_NAMES[product.id] ?? product.id}`
  return `${brand} ${TIER_NAMES[product.tier]}`
}

export function priceCents(product: SiteProduct): number {
  return Math.round(product.priceUsd * 100)
}

export type CheckoutRoute = {
  mode: 'subscription' | 'payment'
  form: CheckoutForm
  lookupKey: string
  // Managed Payments decides the methods itself; nothing else is sent with it.
  managedPayments: boolean
  // Otherwise the one method this route sells through, sent as allowed_payment_method_types:
  // since API 2026-09-30.endive (stripe@23) Checkout no longer takes payment_method_types and
  // filters the account's dynamic payment methods instead. The method must be on in the
  // Dashboard (Settings → Payment methods), or Stripe silently drops it.
  allowedMethods: ['card'] | ['alipay'] | null
}

// §6.3: a card buys a membership as a subscription and a pack as a one-time payment, through
// Managed Payments while it is on; Alipay cannot subscribe, so it always buys one period or
// one pack as a one-time payment, with Shotviva as the seller. 中国银行卡 is the card route with
// Managed Payments off: the same plain-card path as the pre-approval fallback, never a second one.
export function checkoutRoute(product: SiteProduct, method: CheckoutMethod, managedPayments: boolean): CheckoutRoute {
  if (method === 'alipay') {
    return {
      mode: 'payment',
      form: 'one_time',
      lookupKey: lookupKey(product.id, 'one_time'),
      managedPayments: false,
      allowedMethods: ['alipay'],
    }
  }
  const form: CheckoutForm = product.tier === 'pack' ? 'one_time' : 'subscription'
  const viaManagedPayments = method === 'card' && managedPayments
  return {
    mode: form === 'subscription' ? 'subscription' : 'payment',
    form,
    lookupKey: lookupKey(product.id, form),
    managedPayments: viaManagedPayments,
    allowedMethods: viaManagedPayments ? null : ['card'],
  }
}

// The fifteen Prices the account must hold: per membership a recurring and a one-time Price at
// the same amount, per pack one one-time Price.
export type DesiredPrice = {
  lookupKey: string
  productId: ProductId
  stripeProduct: string
  unitAmount: number
  recurring: 'month' | 'year' | null
}

export function desiredPrices(products: readonly SiteProduct[]): DesiredPrice[] {
  return products.flatMap((product) => {
    const base = { productId: product.id, stripeProduct: stripeProductId(product), unitAmount: priceCents(product) }
    const oneTime = { ...base, lookupKey: lookupKey(product.id, 'one_time'), recurring: null }
    if (product.tier === 'pack') return [oneTime]
    return [{ ...base, lookupKey: lookupKey(product.id, 'subscription'), recurring: product.interval }, oneTime]
  })
}
