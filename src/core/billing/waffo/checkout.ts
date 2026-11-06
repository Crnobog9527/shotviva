import 'server-only'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { trackCheckoutStart } from '../../analytics/funnel'
import type { ProductId, SiteProduct } from '../../config'
import type { MembershipProductId } from '../../waffo-env'
import { AppError } from '../../errors'
import { localizePath } from '../../i18n/paths'
import { CHECKOUT_RETURN, successPath, type CheckoutBody } from '../stripe/checkout'
import type { WaffoApi, WaffoSessionRequest } from './client'

// Waffo hosted checkout for one product (ARCHITECTURE §6.3, T50). A membership paid by card is a
// Waffo subscription product that renews every month or year (cards only on the page); paid by
// Alipay it buys one period (+30 / +365 days, same credits) as a one-time product; a pack is
// always one-time. Waffo never offers WeChat Pay for these products.
// The webhook trusts nothing from the browser: it reads user and product from the order
// metadata set here with the API key (Waffo ignores metadata from public, slug-auth sessions).

// Short, as Graylum measured it: the price stays locked for the session's whole life.
export const WAFFO_SESSION_TTL_SECONDS = 30 * 60

export type WaffoCheckoutDeps = {
  waffo: Pick<WaffoApi, 'createCheckoutSession'>
  products: readonly SiteProduct[]
  productIds: Record<ProductId, string>
  subscriptionProductIds: Record<MembershipProductId, string>
  // This deployment's origin (core/site-url). Waffo needs an absolute https URL.
  origin: string
  returnToHosts: readonly string[]
  trackStart?: typeof trackCheckoutStart
  newOrderRef?: () => string
}

const sessionSchema = z.object({
  sessionId: z.string().startsWith('cs_'),
  checkoutUrl: z.url({ protocol: /^https$/ }),
  expiresAt: z.string(),
})

// Only Waffo's own hosts: never redirect the buyer to a URL we did not expect.
function checkoutUrl(data: unknown): string {
  const parsed = sessionSchema.safeParse(data)
  const url = parsed.success ? new URL(parsed.data.checkoutUrl) : null
  if (!url || !(url.hostname === 'waffo.ai' || url.hostname.endsWith('.waffo.ai'))) {
    throw new AppError('INTERNAL', 'Waffo returned an unexpected checkout session')
  }
  return url.toString()
}

// A membership paid by card renews (T50); everything else is one payment.
export function isRecurring(product: SiteProduct, method: CheckoutBody['method']): product is SiteProduct & { id: MembershipProductId } {
  return product.tier !== 'pack' && method === 'card'
}

export function waffoSessionRequest(
  deps: Pick<WaffoCheckoutDeps, 'productIds' | 'subscriptionProductIds' | 'origin' | 'returnToHosts'>,
  input: { userId: string; product: SiteProduct; body: CheckoutBody; orderRef: string },
): WaffoSessionRequest {
  const { product, body } = input
  const recurring = isRecurring(product, body.method)
  return {
    productId: recurring ? deps.subscriptionProductIds[product.id as MembershipProductId] : deps.productIds[product.id],
    currency: 'USD',
    // site.config.ts is the one source of prices (§6.2): the session carries it, so a Waffo
    // product priced differently in the dashboard cannot charge another amount. Tax is added
    // on top at checkout, as with Stripe Managed Payments.
    priceSnapshot: { amount: product.priceUsd.toFixed(2), taxIncluded: false, taxCategory: 'saas' },
    // Back to the return page in the language the buyer checked out in.
    successUrl: `${deps.origin}${localizePath(successPath(CHECKOUT_RETURN.waffo(product.id), body.return_to, deps.returnToHosts), body.locale)}`,
    expiresInSeconds: WAFFO_SESSION_TTL_SECONDS,
    metadata: { user_id: input.userId, product_id: product.id, method: body.method, locale: body.locale },
    orderMerchantExternalId: input.orderRef,
    language: body.locale === 'zh' ? 'zh-Hans' : 'en',
    // The recurring session takes cards only, so a subscription is never paid by a one-off method.
    ...(recurring ? { includePaymentMethods: ['card'] } : {}),
  }
}

export async function createWaffoCheckout(
  deps: WaffoCheckoutDeps,
  input: { userId: string; body: CheckoutBody },
): Promise<{ url: string }> {
  const product = deps.products.find((p) => p.id === input.body.product_id)
  if (!product || product.priceUsd <= 0) throw new AppError('NOT_FOUND', 'Unknown product')
  const request = waffoSessionRequest(deps, {
    userId: input.userId,
    product,
    body: input.body,
    orderRef: (deps.newOrderRef ?? randomUUID)(),
  })
  const url = checkoutUrl(await deps.waffo.createCheckoutSession(request))
  ;(deps.trackStart ?? trackCheckoutStart)(input.userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: isRecurring(product, input.body.method) ? 'subscription' : 'one_time',
    channel: 'waffo',
    method: input.body.method,
  }, input.body.locale)
  return { url }
}
