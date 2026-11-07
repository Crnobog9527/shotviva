import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { cancelOtherSubscriptions } from '@/core/billing/subscription'
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
    const cancelOthers = (userId: string, keep: { waffoOrderId?: string | null }) =>
      cancelOtherSubscriptions({ admin: db, stripe: stripeClient, waffo: () => waffoClient() }, userId, keep)
    deps = { ...waffoWebhookConfig(), db, products: site.billing.products, cancelOthers }
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
