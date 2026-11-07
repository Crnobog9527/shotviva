import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import {
  assertOffered,
  checkoutBodySchema,
  createCheckout,
  managedPaymentsEnabled,
  wechatPayEnabled,
  stripeClient,
  type CheckoutBody,
} from '@/core/billing/stripe'
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
    if (product) await assertCanBuy(createAdminSupabase(), user.id, product)
    const start = channel === 'waffo' ? startWaffo : startStripe
    return jsonResponse(await start(user.id, body.data))
  } catch (error) {
    return errorResponse(error, 'checkout')
  }
}

const shared = { products: site.billing.products, origin: appOrigin, returnToHosts: site.partners.graylum.returnToHosts }

function startStripe(userId: string, body: CheckoutBody) {
  const deps = { ...shared, stripe: stripeClient(), managedPayments: managedPaymentsEnabled(), wechatPay: wechatPayEnabled() }
  return createCheckout(deps, { userId, body })
}

function startWaffo(userId: string, body: CheckoutBody) {
  const config = waffoConfig()
  const deps = { ...shared, waffo: waffoClient(), productIds: config.productIds, subscriptionProductIds: config.subscriptionProductIds }
  return createWaffoCheckout(deps, { userId, body })
}
