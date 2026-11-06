import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import type { StripeApi } from '../stripe/client'
import { readMirrorRows } from './read-summary'

// Before an account is deleted (ARCHITECTURE §13): every subscription Stripe may still bill is
// cancelled at once, with no proration, so a deleted account is never charged again. The
// mirror rows go with the profile (ON DELETE CASCADE), and with them the only way back to the
// Customer Portal, so this has to happen first. Waffo sells no subscriptions.

// Statuses Stripe will never bill again.
const ENDED = new Set(['canceled', 'incomplete_expired'])

type Deps = {
  admin: SupabaseClient
  // Lazy: an account with nothing to cancel never needs Stripe configured.
  stripe: () => Pick<StripeApi, 'subscriptions'>
}

// Stripe answers 404 for a subscription it does not have: nothing there can be billed.
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 404
}

// Whether Stripe will never bill it again: already ended, or unknown to Stripe. False when
// Stripe could not be asked.
async function endedInStripe(stripe: Pick<StripeApi, 'subscriptions'>, id: string): Promise<boolean> {
  try {
    return ENDED.has((await stripe.subscriptions.retrieve(id)).status)
  } catch (error) {
    return isMissing(error)
  }
}

async function cancelOne(stripe: Pick<StripeApi, 'subscriptions'>, id: string): Promise<void> {
  try {
    await stripe.subscriptions.cancel(id, { prorate: false, invoice_now: false })
  } catch (error) {
    // The mirror can lag behind Stripe (the deleted webhook not in yet): an already ended
    // subscription is what we wanted, anything else stops the deletion.
    if (await endedInStripe(stripe, id)) return
    logger.error('subscription cancel before account deletion failed', { subscriptionId: id, error })
    throw new AppError('SUBSCRIPTION_CANCEL_FAILED', 'Could not cancel a subscription', { cause: error })
  }
}

// One at a time, stopping at the first failure: the caller then deletes nothing. A retry skips
// what is already cancelled (mirror synced, or Stripe answers "ended").
export async function cancelAllSubscriptions(deps: Deps, userId: string): Promise<number> {
  const live = (await readMirrorRows(deps.admin, userId)).filter((row) => !ENDED.has(row.status))
  if (live.length === 0) return 0
  const stripe = deps.stripe()
  for (const row of live) await cancelOne(stripe, row.stripeSubscriptionId)
  logger.info('subscriptions cancelled before account deletion', { userId, count: live.length })
  return live.length
}
