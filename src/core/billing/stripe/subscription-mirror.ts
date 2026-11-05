import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

import type { ProductId } from '../../config'
import { AppError } from '../../errors'

// Copies one Stripe subscription into the `subscriptions` mirror (ARCHITECTURE §6.2). Always
// written from an object just retrieved from Stripe, never from the event payload, so an old
// event delivered late still writes the current state: delivery order cannot roll it back.

export type MirrorRow = {
  stripe_subscription_id: string
  user_id: string
  product_id: ProductId
  status: Stripe.Subscription.Status
  current_period_end: string
  cancel_at_period_end: boolean
  updated_at: string
}

// Recent API versions keep the period on the item; a subscription here has exactly one.
export function mirrorRow(sub: Stripe.Subscription, owner: { userId: string; productId: ProductId }, now: Date): MirrorRow {
  const periodEnd = sub.items.data[0]?.current_period_end
  if (typeof periodEnd !== 'number') throw new AppError('INTERNAL', `subscription ${sub.id} has no period end`)
  return {
    stripe_subscription_id: sub.id,
    user_id: owner.userId,
    product_id: owner.productId,
    status: sub.status,
    current_period_end: new Date(periodEnd * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: now.toISOString(),
  }
}

export async function mirrorSubscription(
  db: SupabaseClient,
  sub: Stripe.Subscription,
  owner: { userId: string; productId: ProductId },
): Promise<void> {
  const row = mirrorRow(sub, owner, new Date())
  const { error } = await db.from('subscriptions').upsert(row, { onConflict: 'stripe_subscription_id' })
  if (error) throw new AppError('INTERNAL', `subscription mirror failed: ${error.message}`)
}
