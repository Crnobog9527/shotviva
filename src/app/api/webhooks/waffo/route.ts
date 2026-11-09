import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { paymentCodeEffects } from '@/core/billing'
import { createAdminSupabase } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { cancelOtherSubscriptions, cancelRefundedSubscription, refuseEndedOrder, type EndedOrderInput, type KeepSubscription } from '@/core/billing/subscription'
import { handleWaffoWebhook, waffoClient, waffoWebhookConfig } from '@/core/billing/waffo'
import { site } from '@/site/site.config'

// Public on purpose: Waffo calls it without a session. The X-Waffo-Signature header is the
// authentication (checked first in handleWaffoWebhook; a bad one is 400 and changes nothing).
// The body must stay the raw text: the signature covers the exact bytes. Kept working whatever
// PAYMENT_CHANNEL says, so late events still land after switching back to Stripe.
export async function POST(request: NextRequest) {
  let deps
  try {
    const db = createAdminSupabase()
    // An upgrade cancels the old subscription, whichever channel bills it (T66).
    const cancelDeps = { admin: db, stripe: stripeClient, waffo: () => waffoClient() }
    const cancelOthers = (userId: string, keep: KeepSubscription) => cancelOtherSubscriptions(cancelDeps, userId, keep)
    // A refunded membership's own card subscription stops (T71).
    const cancelRefunded = (userId: string, target: KeepSubscription) => cancelRefundedSubscription(cancelDeps, userId, target)
    // An order an upgrade ended that comes back (a charge, a resume) grants nothing (T66).
    const refuseEnded = (input: EndedOrderInput) => refuseEndedOrder({ admin: db, waffo: () => waffoClient() }, input)
    deps = { ...waffoWebhookConfig(), db, applyCodes: paymentCodeEffects(db, site.growth.invite), products: site.billing.products, cancelOthers, cancelRefunded, refuseEnded }
  } catch (error) {
    // Missing keys: 500 so Waffo keeps retrying while the environment is fixed.
    return errorResponse(error, 'webhooks/waffo')
  }
  const result = await handleWaffoWebhook(deps, {
    body: await request.text(),
    signature: request.headers.get('x-waffo-signature'),
  })
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
}
