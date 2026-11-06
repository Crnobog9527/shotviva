import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { trackCheckoutStart } from '../../analytics/funnel'
import { PRODUCT_IDS, type SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { localizePath } from '../../i18n/paths'
import { allowlistedUrl } from '../../partner/return-to'
import { CHECKOUT_METHODS, checkoutRoute, type CheckoutMethod, type CheckoutRoute } from './catalog'
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

// Where Stripe sends the buyer back. The account page reads `checkout=success` to say thanks
// (and, for a Graylum top-up, offers the way back); the credits themselves arrive through the
// webhook, not this redirect.
export const CHECKOUT_RETURN = {
  success: '/account?checkout=success',
  cancel: '/pricing?checkout=cancelled',
} as const

export function successPath(returnTo: string | undefined, hosts: readonly string[]): string {
  const back = allowlistedUrl(returnTo, hosts)
  if (!back) return CHECKOUT_RETURN.success
  return `${CHECKOUT_RETURN.success}&from=graylum&return_to=${encodeURIComponent(back.toString())}`
}

// `locale` is for analytics only: renewals have no page, so their `purchase` event reads the
// language from the subscription's metadata (ARCHITECTURE §16.2).
type Metadata = { user_id: string; product_id: string; method: CheckoutMethod; locale: CheckoutBody['locale'] }

type MethodParams = Pick<Stripe.Checkout.SessionCreateParams, 'managed_payments' | 'allowed_payment_method_types'>

// A typed literal, not a spread into the params: a parameter Stripe removes from the SDK types
// (as payment_method_types was in 2026-09-30.endive) then fails the type check instead of
// reaching Stripe as a 400.
function methodParams(route: CheckoutRoute): MethodParams {
  if (route.managedPayments) return { managed_payments: { enabled: true } }
  const params: MethodParams = { allowed_payment_method_types: route.allowedMethods ?? ['card'] }
  return params
}

function sessionParams(
  route: CheckoutRoute,
  priceId: string,
  metadata: Metadata,
  input: { locale: CheckoutBody['locale']; origin: string; successPath: string },
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: route.mode,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: metadata.user_id,
    metadata,
    locale: input.locale,
    // Back to the account / pricing page in the language the buyer checked out in.
    success_url: `${input.origin}${localizePath(input.successPath, input.locale)}`,
    cancel_url: `${input.origin}${localizePath(CHECKOUT_RETURN.cancel, input.locale)}`,
    ...methodParams(route),
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

export async function createCheckout(
  deps: CheckoutDeps,
  input: { userId: string; body: CheckoutBody },
): Promise<{ url: string }> {
  const { body } = input
  const product = deps.products.find((p) => p.id === body.product_id)
  if (!product || product.priceUsd <= 0) throw new AppError('NOT_FOUND', 'Unknown product')
  const route = checkoutRoute(product, body.method, deps.managedPayments)
  const priceId = await resolvePriceId(deps.stripe, product, route)
  const metadata = { user_id: input.userId, product_id: product.id, method: body.method, locale: body.locale }
  const session = await deps.stripe.checkout.sessions.create(
    sessionParams(route, priceId, metadata, {
      locale: body.locale,
      origin: deps.origin,
      successPath: successPath(body.return_to, deps.returnToHosts),
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
