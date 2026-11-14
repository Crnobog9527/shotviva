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
import { syncWaffoSubscription, type MirrorState } from '../waffo/subscription-sync'
import { endedInStripe } from './cancel-all'
import { readMirrorRows } from './read-summary'
import { isLiveStatus, type MirrorRow } from './summary'

// The upgrade's second half (ARCHITECTURE §6.2 「升级」, T66): once a higher membership is paid,
// every OTHER subscription that would still renew is cancelled at once, in the same webhook
// handling. Stripe (Managed Payments card and 中国银行卡 alike): cancel now, no proration, no
// final invoice. Waffo: cancel-order, which for an active order only stops renewal at the
// period end (docs.waffo.ai "Cancel Subscription": "There is no immediate cancellation option");
// for us the old plan ends at the upgrade all the same, so its mirror row is written `canceled`
// with the upgrade time as its end (canceled is final in sync_waffo_subscription, so Waffo's own
// canceling / canceled events cannot reopen it), and ended-order.ts refuses any later charge or
// reactivation of that order. The mirror is written from the answer straight away. A failed cancel is logged and alerted for the Owner to finish by hand;
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

const ENDED_BY_UPGRADE: MirrorState = { status: 'canceled', cancelAtPeriodEnd: false }

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
  const at = (deps.now ?? (() => new Date()))().toISOString()
  await syncWaffoSubscription(deps.admin, {
    userId,
    orderId: row.waffoOrderId,
    productId: row.productId,
    state: ENDED_BY_UPGRADE,
    periodEnd: at,
    eventAt: at,
  })
  logger.info('waffo order ended by upgrade', { orderId: row.waffoOrderId, waffoStatus: result.status, waffoPeriodEnd: result.currentPeriodEnd ?? null })
}

// Why a subscription is cut short: an upgrade replaced it, or its payment was refunded (T71).
export type CancelCause = 'upgrade' | 'refund'

const FAILED: Record<CancelCause, string> = {
  upgrade: 'Upgrade paid but the old subscription was not cancelled: cancel it by hand',
  refund: 'Membership refunded but its subscription was not cancelled: cancel it by hand',
}

async function cancelOne(deps: CancelOthersDeps, row: MirrorRow, userId: string, cause: CancelCause): Promise<boolean> {
  const ref = row.provider === 'stripe' ? row.stripeSubscriptionId : row.waffoOrderId
  try {
    if (row.provider === 'waffo' && row.waffoOrderId) await cancelWaffo(deps, { ...row, waffoOrderId: row.waffoOrderId }, userId)
    else if (row.stripeSubscriptionId) await cancelStripe(deps, row.stripeSubscriptionId)
    logger.info(`subscription cancelled after ${cause}`, { userId, provider: row.provider, ref })
    return true
  } catch (error) {
    const fields = { user_id: userId, provider: row.provider, subscription: ref, product_id: row.productId, cause }
    logger.error(`subscription cancel after ${cause} failed`, { ...fields, error })
    captureAlert('subscription_cancel_failed', FAILED[cause], { fields })
    notifyOwner({ kind: 'subscription_cancel_failed', userId, channel: row.provider, productId: row.productId, subscriptionRef: ref, cause })
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
    notifyOwner({ kind: 'subscription_cancel_failed', userId, channel: null, productId: null, subscriptionRef: null })
    return { cancelled: 0, failed: 1 }
  }
  for (const row of rows) {
    if (await cancelOne(deps, row, userId, 'upgrade')) result.cancelled += 1
    else result.failed += 1
  }
  return result
}

// The subscription a refunded membership payment belongs to (ARCHITECTURE §6.2 「会员退款」, T71):
// cancelled at once, no proration, the same way an upgrade ends the old one. Only that one: the
// user's other memberships still count (their paid_until is kept). Nothing to do when it is not
// renewing any more (already cancelling or ended), or for a one-time purchase (target empty).
export type CancelRefunded = (userId: string, target: KeepSubscription) => Promise<'cancelled' | 'none' | 'failed'>

const matches = (row: MirrorRow, target: KeepSubscription) =>
  row.provider === 'stripe'
    ? Boolean(target.stripeSubscriptionId) && row.stripeSubscriptionId === target.stripeSubscriptionId
    : Boolean(target.waffoOrderId) && row.waffoOrderId === target.waffoOrderId

export async function cancelRefundedSubscription(deps: CancelOthersDeps, userId: string, target: KeepSubscription): Promise<'cancelled' | 'none' | 'failed'> {
  if (!target.stripeSubscriptionId && !target.waffoOrderId) return 'none'
  let rows: MirrorRow[]
  try {
    rows = (await readMirrorRows(deps.admin, userId)).filter((row) => renewing(row, {}) && matches(row, target))
  } catch (error) {
    const ref = target.stripeSubscriptionId ?? target.waffoOrderId ?? null
    logger.error('refund: mirror read failed', { userId, ref, error })
    captureAlert('subscription_cancel_failed', FAILED.refund, { fields: { user_id: userId, subscription: ref, cause: 'refund' } })
    notifyOwner({ kind: 'subscription_cancel_failed', userId, channel: target.stripeSubscriptionId ? 'stripe' : 'waffo', productId: null, subscriptionRef: ref, cause: 'refund' })
    return 'failed'
  }
  let outcome: 'cancelled' | 'none' | 'failed' = 'none'
  for (const row of rows) outcome = (await cancelOne(deps, row, userId, 'refund')) ? 'cancelled' : 'failed'
  return outcome
}
