import type { NextRequest } from 'next/server'

import { bindReferral } from '@/core/affiliate/referral'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, clientIp, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import {
  assertOffered,
  checkoutBodySchema,
  checkoutToken,
  DISCOUNT_CANCEL_COOKIE,
  createCheckout,
  managedPaymentsEnabled,
  wechatPayEnabled,
  stripeClient,
  termsConsentEnabled,
  type CheckoutBody,
  type CheckoutClient,
} from '@/core/billing/stripe'
import { readActivePricing } from '@/core/billing/active-pricing'
import { buyerQuote, type BuyerQuote } from '@/core/billing/buyer-quote'
import { configuredPricing } from '@/core/billing/checkout-price'
import { assertCanBuy } from '@/core/billing/subscription'
import { createWaffoCheckout, paymentChannel, waffoClient, waffoConfig } from '@/core/billing/waffo'
import { AppError } from '@/core/errors'
import { appOrigin } from '@/core/site-url'
import { site } from '@/site/site.config'

// Starts a hosted checkout for one product and payment method; answers { url } to redirect to.
// Signed-in, same-origin, not banned (403, before the channel switch so it covers both
// channels; ARCHITECTURE §7), and while a membership runs only a higher plan (409
// DOWNGRADE_NOT_ALLOWED otherwise; §6.2 「升级」, T66). PAYMENT_CHANNEL picks Stripe (routing per
// payment method lives in core/billing/stripe) or Waffo (card memberships recurring, the rest
// one-time, ARCHITECTURE §6.3).
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const body = checkoutBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'product_id and method are required')
    // Only what the buyer's page listed: 中国银行卡 needs a zh locale and the Stripe channel (T64).
    const channel = paymentChannel()
    assertOffered(body.data, channel)
    // Upgrades only: the same or a lower plan while a membership runs answers 409. An upgrade is
    // an ordinary checkout at full price; the payment webhook cancels the old subscription.
    const product = site.billing.products.find((p) => p.id === body.data.product_id)
    if (!product) throw new AppError('NOT_FOUND', 'Unknown product')
    const admin = createAdminSupabase()
    await assertCanBuy(admin, user.id, product)
    const version = configuredPricing(site.billing)
    if (await readActivePricing(admin) !== version) throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Pricing catalog is changing')
    const quote = version && await buyerQuote(admin, user.id, product, body.data, channel)
    await bindReferral(user.id, request.cookies.get('sv_ref')?.value, 'first_checkout')
    if (channel === 'waffo') return jsonResponse(await startWaffo(user.id, body.data, quote))
    // Dispute evidence (T82): who opened checkout, from where.
    const client = { ip: clientIp(request.headers), userAgent: request.headers.get('user-agent') }
    const token = checkoutToken(user.id, body.data, request.headers.get('idempotency-key'), site.billing.products, quote)
    const { url, cancelReceipt } = await startStripe(user.id, body.data, client, token, quote)
    const response = jsonResponse({ url })
    if (cancelReceipt) response.cookies.set(DISCOUNT_CANCEL_COOKIE, cancelReceipt, {
      path: '/api/checkout/cancel', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600,
    })
    return response
  } catch (error) {
    return errorResponse(error, 'checkout')
  }
}

const shared = { products: site.billing.products, origin: appOrigin, returnToHosts: site.partners.graylum.returnToHosts }

function startStripe(userId: string, body: CheckoutBody, client: CheckoutClient, token: string, quote?: BuyerQuote) {
  const deps = { ...shared, stripe: stripeClient(), codes: createAdminSupabase(), managedPayments: managedPaymentsEnabled(), wechatPay: wechatPayEnabled(), termsConsent: termsConsentEnabled() }
  return createCheckout(deps, { userId, body, client, token, quote: quote?.price, packCode: quote?.packCode })
}

function startWaffo(userId: string, body: CheckoutBody, quote?: BuyerQuote) {
  if (body.expected_code) throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Discount is unavailable on this payment channel')
  const config = waffoConfig()
  const deps = { ...shared, waffo: waffoClient(), productIds: config.productIds, subscriptionProductIds: config.subscriptionProductIds }
  return createWaffoCheckout(deps, { userId, body, quote: quote?.price })
}
