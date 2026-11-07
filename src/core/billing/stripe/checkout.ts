import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { trackCheckoutStart } from '../../analytics/funnel'
import { PRODUCT_IDS, type PaymentChannel, type ProductId, type SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { localizePath } from '../../i18n/paths'
import { allowlistedUrl } from '../../partner/return-to'
import { CHECKOUT_METHODS, checkoutRoute, offeredMethods, type CheckoutMethod, type CheckoutRoute } from './catalog'
import { cancelReturnUrl, PRICING_CANCELLED } from './cancel-return'
import { cardOnlyConfigId } from './card-only'
import type { StripeApi } from './client'
import { resolvePriceId } from './prices'

// Creates the hosted Checkout Session for one product and one payment method (ARCHITECTURE
// §6.3). The webhook trusts nothing from the browser: it re-reads the session from Stripe and
// the product from the Price's metadata.

export const CHECKOUT_LOCALES = ['en', 'zh'] as const

export const checkoutBodySchema = z.strictObject({
  product_id: z.enum(PRODUCT_IDS),
  method: z.enum(CHECKOUT_METHODS),
  locale: z.enum(CHECKOUT_LOCALES).default('en'),
  // Graylum top-up (ARCHITECTURE §14.5): where the success page offers to send the buyer back.
  // Kept only when its host is allowlisted; anything else is dropped, never echoed.
  return_to: z.string().max(2048).optional(),
})
export type CheckoutBody = z.infer<typeof checkoutBodySchema>

export type CheckoutDeps = {
  stripe: StripeApi
  products: readonly SiteProduct[]
  managedPayments: boolean
  // This deployment's origin (core/site-url): previews return to their own URL.
  origin: string
  // site.partners.graylum.returnToHosts
  returnToHosts: readonly string[]
  trackStart?: typeof trackCheckoutStart
}

// Where the buyer comes back (T43). Stripe fills {CHECKOUT_SESSION_ID} into success_url; the
// return page reads that session and our payments row, and says thanks or "confirming". Waffo
// has no placeholder, so its success URL names the product (core/billing/checkout-return). The
// credits themselves arrive through the webhook, never this redirect. Cancel goes back to
// /pricing, which shows a toast, by way of /api/checkout/cancel (cancel-return.ts, T74).
export const CHECKOUT_RETURN = {
  stripe: '/checkout?session_id={CHECKOUT_SESSION_ID}',
  waffo: (productId: string) => `/checkout?channel=waffo&p=${encodeURIComponent(productId)}`,
  cancel: PRICING_CANCELLED,
} as const

// The return path, plus the Graylum way back when the top-up came from an allowlisted host.
export function successPath(base: string, returnTo: string | undefined, hosts: readonly string[]): string {
  const back = allowlistedUrl(returnTo, hosts)
  if (!back) return base
  return `${base}&from=graylum&return_to=${encodeURIComponent(back.toString())}`
}

// `locale` is for analytics only: renewals have no page, so their `purchase` event reads the
// language from the subscription's metadata (ARCHITECTURE §16.2).
type Metadata = { user_id: string; product_id: ProductId; method: CheckoutMethod; locale: CheckoutBody['locale'] }

type MethodParams = Pick<
  Stripe.Checkout.SessionCreateParams,
  'managed_payments' | 'allowed_payment_method_types' | 'wallet_options' | 'payment_method_configuration'
>

// A typed literal, not a spread into the params: a parameter Stripe removes from the SDK types
// (as payment_method_types was in 2026-09-30.endive) then fails the type check instead of
// reaching Stripe as a 400.
// Managed Payments is always said out loud, on or off: the live Dashboard can turn it on by
// default for every Checkout Session, and it does not take Alipay. So an Alipay period, an
// Alipay pack, 中国银行卡 and the plain-card fallback (STRIPE_MANAGED_PAYMENTS off) send
// enabled: false, and the session never depends on that toggle. No automatic_tax anywhere:
// Managed Payments adds its own tax, and on the plain routes Shotviva is the seller (§6.3).
function methodParams(route: CheckoutRoute, cardOnlyConfig: string | null): MethodParams {
  if (route.managedPayments) return { managed_payments: { enabled: true } }
  const off = { enabled: false }
  if (!isPlainCard(route)) return { managed_payments: off, allowed_payment_method_types: route.allowedMethods ?? ['card'] }
  // Stripe takes one of allowed_payment_method_types and payment_method_configuration; the
  // configuration has only card on, so it is the same filter with the wallets off too.
  const methods: MethodParams = cardOnlyConfig ? { payment_method_configuration: cardOnlyConfig } : { allowed_payment_method_types: ['card'] }
  return { managed_payments: off, ...methods, ...PLAIN_CARD }
}

// 中国银行卡 and the card fallback (T64, Codex on #249): the card form only. allowed_payment_method_types
// ['card'] alone still let Checkout show Link (with its bank and Klarna buttons), Apple Pay and
// Google Pay. The card-only configuration (card-only.ts) turns the wallets off; Link is also turned
// off here in case that configuration is missing. Adaptive Pricing stays as the Dashboard sets it
// (Owner 2026-11-08): the buyer may see their own currency, Shotviva is paid in USD.
const PLAIN_CARD = { wallet_options: { link: { display: 'never' } } } satisfies MethodParams

function isPlainCard(route: CheckoutRoute): boolean {
  return !route.managedPayments && route.allowedMethods?.[0] === 'card'
}

function sessionParams(
  route: CheckoutRoute,
  priceId: string,
  metadata: Metadata,
  input: { locale: CheckoutBody['locale']; origin: string; successPath: string; cardOnlyConfig: string | null },
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: route.mode,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: metadata.user_id,
    metadata,
    locale: input.locale,
    // Back to the return page / pricing in the language the buyer checked out in.
    success_url: `${input.origin}${localizePath(input.successPath, input.locale)}`,
    // Through /api/checkout/cancel, which counts the cancel and lands on pricing (T74).
    cancel_url: cancelReturnUrl(input.origin, { product_id: metadata.product_id, method: metadata.method, locale: input.locale }),
    ...methodParams(route, input.cardOnlyConfig),
    ...(route.mode === 'subscription' ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
  }
}

// allowed_payment_method_types filters silently: a method that is off in the Dashboard leaves
// the buyer on a checkout page that cannot take their payment. Refuse instead of redirecting.
function assertMethodOffered(route: CheckoutRoute, session: Pick<Stripe.Checkout.Session, 'id' | 'payment_method_types'>) {
  const required = route.allowedMethods?.[0]
  if (!required || session.payment_method_types?.includes(required)) return
  throw new AppError('INTERNAL', `Checkout session ${session.id} does not offer ${required}; turn it on in Stripe Settings → Payment methods`)
}

// Checkout takes only what the buyer's page listed (catalog offeredMethods): 中国银行卡 exists on
// zh pages over Stripe alone (§6.3, T64), so asking for it with an English locale or on Waffo is
// refused (422) rather than quietly opened.
export function assertOffered(body: Pick<CheckoutBody, 'method' | 'locale'>, channel: PaymentChannel): void {
  if (offeredMethods(channel, body.locale).includes(body.method)) return
  throw new AppError('INVALID_INPUT', `${body.method} is not offered on ${channel} for locale ${body.locale}`)
}

export async function createCheckout(
  deps: CheckoutDeps,
  input: { userId: string; body: CheckoutBody },
): Promise<{ url: string }> {
  const { body } = input
  const product = deps.products.find((p) => p.id === body.product_id)
  if (!product || product.priceUsd <= 0) throw new AppError('NOT_FOUND', 'Unknown product')
  const route = checkoutRoute(product, body.method, deps.managedPayments)
  const priceId = await resolvePriceId(deps.stripe, product, route)
  const cardOnlyConfig = isPlainCard(route) ? await cardOnlyConfigId(deps.stripe) : null
  const metadata = { user_id: input.userId, product_id: product.id, method: body.method, locale: body.locale }
  const session = await deps.stripe.checkout.sessions.create(
    sessionParams(route, priceId, metadata, {
      locale: body.locale,
      origin: deps.origin,
      successPath: successPath(CHECKOUT_RETURN.stripe, body.return_to, deps.returnToHosts),
      cardOnlyConfig,
    }),
  )
  if (!session.url) throw new AppError('INTERNAL', 'Stripe returned a session without a URL')
  assertMethodOffered(route, session)
  ;(deps.trackStart ?? trackCheckoutStart)(input.userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: route.form,
    channel: 'stripe',
    method: body.method,
  }, body.locale)
  return { url: session.url }
}
