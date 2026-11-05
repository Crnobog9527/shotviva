import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { trackCheckoutStart } from '../../analytics/funnel'
import { PRODUCT_IDS, type SiteProduct } from '../../config'
import { AppError } from '../../errors'
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

type Metadata = { user_id: string; product_id: string; method: CheckoutMethod }

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
    success_url: `${input.origin}${input.successPath}`,
    cancel_url: `${input.origin}${CHECKOUT_RETURN.cancel}`,
    ...(route.managedPayments
      ? { managed_payments: { enabled: true } }
      : { payment_method_types: route.paymentMethodTypes ?? ['card'] }),
    ...(route.mode === 'subscription' ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
  }
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
  const metadata = { user_id: input.userId, product_id: product.id, method: body.method }
  const session = await deps.stripe.checkout.sessions.create(
    sessionParams(route, priceId, metadata, {
      locale: body.locale,
      origin: deps.origin,
      successPath: successPath(body.return_to, deps.returnToHosts),
    }),
  )
  if (!session.url) throw new AppError('INTERNAL', 'Stripe returned a session without a URL')
  ;(deps.trackStart ?? trackCheckoutStart)(input.userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: route.form,
    channel: 'stripe',
    method: body.method,
  })
  return { url: session.url }
}
