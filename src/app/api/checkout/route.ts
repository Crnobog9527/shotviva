import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, requireApiUser } from '@/core/auth'
import { checkoutBodySchema, createCheckout, managedPaymentsEnabled, stripeClient } from '@/core/billing/stripe'
import { AppError } from '@/core/errors'
import { appOrigin } from '@/core/site-url'
import { site } from '@/site/site.config'

// Starts a Stripe Checkout for one product and payment method; answers { url } to redirect to.
// Signed-in, same-origin only. Routing per payment method lives in core/billing/stripe.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body = checkoutBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'product_id and method are required')
    const deps = {
      stripe: stripeClient(),
      products: site.billing.products,
      managedPayments: managedPaymentsEnabled(),
      origin: appOrigin,
      returnToHosts: site.partners.graylum.returnToHosts,
    }
    return jsonResponse(await createCheckout(deps, { userId: user.id, body: body.data }))
  } catch (error) {
    return errorResponse(error, 'checkout')
  }
}
