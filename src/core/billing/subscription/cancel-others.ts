import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { notifyOwner } from '../../alerts'
import { captureAlert } from '../../analytics/capture-error'
import { logger } from '../../logger'
import type { RpcClient } from '../rpc'
import type { StripeApi } from '../stripe/client'
import { subscriptionState } from '../stripe/settle'
import { writeSubscriptionState } from '../stripe/subscription-sync'
import type { WaffoApi } from '../waffo/client'
import { isoOf, mirrorState, syncWaffoSubscription } from '../waffo/subscription-sync'
import { endedInStripe } from './cancel-all'
import { readMirrorRows } from './read-summary'
import { isLiveStatus, type MirrorRow } from './summary'

// The upgrade's second half (ARCHITECTURE §6.2 「升级」, T66): once a higher membership is paid,
// every OTHER subscription that would still renew is cancelled at once, in the same webhook
// handling. Stripe (Managed Payments card and 中国银行卡 alike): cancel now, no proration, no
// final invoice. Waffo: cancel-order (it never charges again). The mirror is written from the
// answer straight away. A failed cancel is logged and alerted for the Owner to finish by hand;
// it never undoes the new plan and never fails the webhook (the payment is already granted).
// Idempotent: a redelivered event finds the old rows ended (or Stripe answers "already ended").

export type CancelOthersDeps = {
  admin: SupabaseClient & RpcClient
  // Lazy: most upgrades only ever touch one provider.
  stripe: () => Pick<StripeApi, 'subscriptions'>
  waffo: () => Pick<WaffoApi, 'cancelSubscription'>
  now?: () => Date
}

// The subscription just bought (null for a one-time upgrade, which keeps nothing).
export type KeepSubscription = { stripeSubscriptionId?: string | null; waffoOrderId?: string | null }

export type CancelOthersResult = { cancelled: number; failed: number }

// What the payment webhooks are handed: cancelOtherSubscriptions bound to its clients. Never throws.
export type CancelOthers = (userId: string, keep: KeepSubscription) => Promise<CancelOthersResult>

// Still renewing: a live status without a cancel already on record. A cancelling one ends at its
// period end and never bills again, so it is left alone.
function renewing(row: MirrorRow, keep: KeepSubscription): boolean {
  if (!isLiveStatus(row.status) || row.cancelAtPeriodEnd) return false
  if (row.provider === 'stripe') return row.stripeSubscriptionId !== null && row.stripeSubscriptionId !== keep.stripeSubscriptionId
  return row.waffoOrderId !== null && row.waffoOrderId !== keep.waffoOrderId
}

async function cancelStripe(deps: CancelOthersDeps, id: string): Promise<void> {
  const stripe = deps.stripe()
  try {
    const cancelled = await stripe.subscriptions.cancel(id, { prorate: false, invoice_now: false })
    await writeSubscriptionState(deps.admin, subscriptionState(cancelled))
  } catch (error) {
    // The mirror can lag behind Stripe: an already ended subscription is what we wanted, and
    // its customer.subscription.deleted event syncs the mirror.
    if (await endedInStripe(stripe, id)) return
    throw error
  }
}

async function cancelWaffo(deps: CancelOthersDeps, row: MirrorRow & { waffoOrderId: string }, userId: string): Promise<void> {
  const result = await deps.waffo().cancelSubscription(row.waffoOrderId)
  await syncWaffoSubscription(deps.admin, {
    userId,
    orderId: row.waffoOrderId,
    productId: row.productId,
    state: mirrorState(result.status) ?? { status: 'active', cancelAtPeriodEnd: true },
    periodEnd: isoOf(result.currentPeriodEnd),
    eventAt: (deps.now ?? (() => new Date()))().toISOString(),
  })
}

async function cancelOne(deps: CancelOthersDeps, row: MirrorRow, userId: string): Promise<boolean> {
  const ref = row.provider === 'stripe' ? row.stripeSubscriptionId : row.waffoOrderId
  try {
    if (row.provider === 'waffo' && row.waffoOrderId) await cancelWaffo(deps, { ...row, waffoOrderId: row.waffoOrderId }, userId)
    else if (row.stripeSubscriptionId) await cancelStripe(deps, row.stripeSubscriptionId)
    logger.info('old subscription cancelled after upgrade', { userId, provider: row.provider, ref })
    return true
  } catch (error) {
    const fields = { user_id: userId, provider: row.provider, subscription: ref, product_id: row.productId }
    logger.error('old subscription cancel after upgrade failed', { ...fields, error })
    captureAlert('subscription_cancel_failed', 'Upgrade paid but the old subscription was not cancelled: cancel it by hand', { fields })
    await notifyOwner({ kind: 'subscription_cancel_failed', userId, channel: row.provider, productId: row.productId, subscriptionRef: ref })
    return false
  }
}

// One at a time; a failure is alerted and the rest still go.
export async function cancelOtherSubscriptions(deps: CancelOthersDeps, userId: string, keep: KeepSubscription): Promise<CancelOthersResult> {
  const result: CancelOthersResult = { cancelled: 0, failed: 0 }
  let rows: MirrorRow[]
  try {
    rows = (await readMirrorRows(deps.admin, userId)).filter((row) => renewing(row, keep))
  } catch (error) {
    logger.error('upgrade: mirror read failed', { userId, error })
    captureAlert('subscription_cancel_failed', 'Upgrade paid but the old subscriptions could not be read: check by hand', { fields: { user_id: userId } })
    await notifyOwner({ kind: 'subscription_cancel_failed', userId, channel: null, productId: null, subscriptionRef: null })
    return { cancelled: 0, failed: 1 }
  }
  for (const row of rows) {
    if (await cancelOne(deps, row, userId)) result.cancelled += 1
    else result.failed += 1
  }
  return result
}
