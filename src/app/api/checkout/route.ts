import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, requireApiUser } from '@/core/auth'
import {
  checkoutBodySchema,
  createCheckout,
  managedPaymentsEnabled,
  stripeClient,
  type CheckoutBody,
} from '@/core/billing/stripe'
import { createWaffoCheckout, paymentChannel, waffoClient, waffoConfig } from '@/core/billing/waffo'
import { AppError } from '@/core/errors'
import { appOrigin } from '@/core/site-url'
import { site } from '@/site/site.config'

// Starts a hosted checkout for one product and payment method; answers { url } to redirect to.
// Signed-in, same-origin only. PAYMENT_CHANNEL picks Stripe (routing per payment method lives
// in core/billing/stripe) or Waffo (always one-time, ARCHITECTURE §6.3).
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body = checkoutBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'product_id and method are required')
    const start = paymentChannel() === 'waffo' ? startWaffo : startStripe
    return jsonResponse(await start(user.id, body.data))
  } catch (error) {
    return errorResponse(error, 'checkout')
  }
}

const shared = { products: site.billing.products, origin: appOrigin, returnToHosts: site.partners.graylum.returnToHosts }

function startStripe(userId: string, body: CheckoutBody) {
  const deps = { ...shared, stripe: stripeClient(), managedPayments: managedPaymentsEnabled() }
  return createCheckout(deps, { userId, body })
}

function startWaffo(userId: string, body: CheckoutBody) {
  const deps = { ...shared, waffo: waffoClient(), productIds: waffoConfig().productIds }
  return createWaffoCheckout(deps, { userId, body })
}
