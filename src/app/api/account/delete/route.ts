import type { NextRequest } from 'next/server'

import { createAdminSupabase, handleDeleteAccount } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { cancelAllSubscriptions } from '@/core/billing/subscription'
import { waffoClient } from '@/core/billing/waffo'
import { archiveOrgWorksOf } from '@/core/org/works'
import { r2Store } from '@/core/storage'

// Requires a session (checked in the handler) plus a same-origin request. Live Stripe
// and Waffo subscriptions are cancelled before anything is deleted (ARCHITECTURE §13, T50), then
// the account's 企业作品 move into their org's archive (they belong to the org, 1971).
export async function POST(request: NextRequest) {
  return handleDeleteAccount(request, {
    cancelSubscriptions: (userId) => cancelAllSubscriptions({ admin: createAdminSupabase(), stripe: stripeClient, waffo: () => waffoClient() }, userId),
    archiveOrgWorks: (userId) => archiveOrgWorksOf({ db: createAdminSupabase(), store: r2Store() }, userId),
  })
}
