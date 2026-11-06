import type { NextRequest } from 'next/server'

import { createAdminSupabase, handleDeleteAccount } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { cancelAllSubscriptions } from '@/core/billing/subscription'

// Requires a session (checked in the handler) plus a same-origin request. Live Stripe
// subscriptions are cancelled before anything is deleted (ARCHITECTURE §13).
export async function POST(request: NextRequest) {
  return handleDeleteAccount(request, {
    cancelSubscriptions: (userId) => cancelAllSubscriptions({ admin: createAdminSupabase(), stripe: stripeClient }, userId),
  })
}
