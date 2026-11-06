import type { NextRequest } from 'next/server'

import { createAdminSupabase, handleDeleteAccount } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { cancelAllSubscriptions } from '@/core/billing/subscription'
import { waffoClient } from '@/core/billing/waffo'

// Requires a session (checked in the handler) plus a same-origin request. Live Stripe
// and Waffo subscriptions are cancelled before anything is deleted (ARCHITECTURE §13, T50).
export async function POST(request: NextRequest) {
  return handleDeleteAccount(request, {
    cancelSubscriptions: (userId) => cancelAllSubscriptions({ admin: createAdminSupabase(), stripe: stripeClient, waffo: () => waffoClient() }, userId),
  })
}
