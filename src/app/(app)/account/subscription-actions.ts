'use server'

import { redirect } from 'next/navigation'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { createPortalUrl } from '@/core/billing/subscription'
import { appOrigin } from '@/core/site-url'

// "Manage subscription": a fresh Stripe Customer Portal session for the signed-in user's own
// subscription, then back to /account when they are done.
export async function manageSubscriptionAction() {
  const user = await requireUser('/account')
  const url = await createPortalUrl(
    { stripe: stripeClient(), admin: createAdminSupabase() },
    { userId: user.id, returnUrl: `${appOrigin}/account` },
  )
  redirect(url)
}
