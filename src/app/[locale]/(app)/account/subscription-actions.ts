'use server'

import { redirect } from 'next/navigation'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { createPortalUrl } from '@/core/billing/subscription'
import { localized } from '@/core/i18n/server'
import { appOrigin } from '@/core/site-url'

// "Manage subscription": a fresh Stripe Customer Portal session for the signed-in user's own
// subscription, then back to /account (in the page's language) when they are done.
export async function manageSubscriptionAction() {
  const user = await requireUser('/account')
  const url = await createPortalUrl(
    { stripe: stripeClient(), admin: createAdminSupabase() },
    { userId: user.id, returnUrl: `${appOrigin}${await localized('/account')}` },
  )
  redirect(url)
}
