import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase } from '@/core/auth'
import { handleStripeWebhook, managedPaymentsEnabled, stripeClient, stripeWebhookSecret } from '@/core/billing/stripe'
import { cancelOtherSubscriptions, cancelRefundedSubscription, type KeepSubscription } from '@/core/billing/subscription'
import { waffoClient } from '@/core/billing/waffo'
import { disputeEvidenceConfig } from '@/site/dispute-evidence'
import { site } from '@/site/site.config'

// Public on purpose: Stripe calls it without a session. The Stripe-Signature header is the
// authentication (checked first in handleStripeWebhook; a bad one is 400 and changes nothing).
// The body must stay the raw text: the signature covers the exact bytes.
export async function POST(request: NextRequest) {
  let deps
  try {
    const stripe = stripeClient()
    const db = createAdminSupabase()
    const cancelDeps = { admin: db, stripe: () => stripe, waffo: () => waffoClient() }
    deps = {
      stripe,
      db,
      products: site.billing.products,
      webhookSecret: stripeWebhookSecret(),
      // An upgrade cancels the old subscription, whichever channel bills it (T66).
      cancelOthers: (userId: string, keep: KeepSubscription) => cancelOtherSubscriptions(cancelDeps, userId, keep),
      // A refunded membership's own subscription stops at once (T71).
      cancelRefunded: (userId: string, target: KeepSubscription) => cancelRefundedSubscription(cancelDeps, userId, target),
      // A dispute stages its evidence draft and links the admin page (T82).
      evidence: disputeEvidenceConfig({ managedPayments: managedPaymentsEnabled() }),
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
