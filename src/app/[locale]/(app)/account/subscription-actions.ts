'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { createPortalUrl } from '@/core/billing/subscription'
import { cancelWaffoSubscription, waffoClient } from '@/core/billing/waffo'
import { logger } from '@/core/logger'
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

// "Cancel subscription" on a Waffo card subscription (T50): Waffo cancels at period end, the
// mirror says so, and the account page is re-rendered. Only the signed-in user's own order.
export async function cancelWaffoSubscriptionAction(): Promise<{ ok: boolean }> {
  const user = await requireUser('/account')
  try {
    await cancelWaffoSubscription({ db: createAdminSupabase(), waffo: waffoClient() }, user.id)
  } catch (error) {
    logger.error('waffo cancel from account failed', { error })
    return { ok: false }
  }
  revalidatePath('/[locale]/account', 'page')
  return { ok: true }
}
