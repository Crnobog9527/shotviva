import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../rpc'
import type { FulfilDeps } from './fulfil'
import { subscriptionState, type SubscriptionState } from './settle'

// customer.subscription.updated / deleted (ARCHITECTURE §6.2): only the mirror changes. The
// subscription is re-read from Stripe, so whatever order the events arrive in, the mirror ends
// on Stripe's current state. Credits and paid_until are never touched: a cancellation takes
// effect at period end and paid_until already runs to it.

export type SyncOutcome = 'synced' | 'unknown'

export async function syncSubscription(deps: FulfilDeps, subscriptionId: string): Promise<SyncOutcome> {
  const found = await writeSubscriptionState(deps.db, subscriptionState(await deps.stripe.subscriptions.retrieve(subscriptionId)))
  // Unknown: its first payment has not settled yet; settle_checkout writes the current state.
  return found ? 'synced' : 'unknown'
}

// sync_subscription: absolute state by subscription id; false when the mirror has no such row.
// Also used right after the upgrade step cancels an old subscription (T66).
export function writeSubscriptionState(db: RpcClient, state: SubscriptionState): Promise<boolean> {
  return callRpc(
    db,
    'sync_subscription',
    {
      p_subscription_id: state.id,
      p_status: state.status,
      p_current_period_end: state.currentPeriodEnd.toISOString(),
      p_cancel_at_period_end: state.cancelAtPeriodEnd,
    },
    z.boolean(),
  )
}
