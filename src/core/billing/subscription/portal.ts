import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../../errors'
import type { StripeApi } from '../stripe/client'
import { readMirrorRows } from './read-summary'

// "Manage subscription" (ARCHITECTURE §6.2): Shotviva writes no cancel screen; the buyer
// cancels, changes card or downloads invoices in the Stripe Customer Portal (Link's customer
// portal under Managed Payments). Which features the Portal allows is set by the Owner in
// the Stripe Dashboard (Settings → Billing → Customer portal), not here.
//
// The customer comes from the user's own mirrored subscription, re-read from Stripe, so a user
// can only ever open the Portal of a customer that paid for their account. Portal sessions
// expire within minutes, so one is created per click and never stored.

export async function createPortalUrl(
  deps: { stripe: StripeApi; admin: SupabaseClient },
  input: { userId: string; returnUrl: string },
): Promise<string> {
  const rows = await readMirrorRows(deps.admin, input.userId)
  const newest = [...rows].sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime())[0]
  if (!newest) throw new AppError('NOT_FOUND', 'no subscription to manage')
  const sub = await deps.stripe.subscriptions.retrieve(newest.stripeSubscriptionId)
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const session = await deps.stripe.billingPortal.sessions.create({ customer, return_url: input.returnUrl })
  return session.url
}
