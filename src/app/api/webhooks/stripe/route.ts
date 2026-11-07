import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase } from '@/core/auth'
import { handleStripeWebhook, stripeClient, stripeWebhookSecret } from '@/core/billing/stripe'
import { cancelOtherSubscriptions } from '@/core/billing/subscription'
import { waffoClient } from '@/core/billing/waffo'
import { site } from '@/site/site.config'

// Public on purpose: Stripe calls it without a session. The Stripe-Signature header is the
// authentication (checked first in handleStripeWebhook; a bad one is 400 and changes nothing).
// The body must stay the raw text: the signature covers the exact bytes.
export async function POST(request: NextRequest) {
  let deps
  try {
    const stripe = stripeClient()
    const db = createAdminSupabase()
    deps = {
      stripe,
      db,
      products: site.billing.products,
      webhookSecret: stripeWebhookSecret(),
      // An upgrade cancels the old subscription, whichever channel bills it (T66).
      cancelOthers: (userId: string, keep: { stripeSubscriptionId?: string | null }) =>
        cancelOtherSubscriptions({ admin: db, stripe: () => stripe, waffo: () => waffoClient() }, userId, keep),
    }
  } catch (error) {
    // Missing keys: 500 so Stripe keeps retrying until the environment is fixed.
    return errorResponse(error, 'webhooks/stripe')
  }
  const result = await handleStripeWebhook(deps, {
    body: await request.text(),
    signature: request.headers.get('stripe-signature'),
  })
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
}
