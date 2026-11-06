import 'server-only'

import { z } from 'zod'

import { AppError } from '../../errors'
import { callRpc, type RpcClient } from '../rpc'
import { metadataSchema } from './payment-facts'

// A Waffo card subscription's state, mirrored into subscriptions (provider 'waffo', T50,
// ARCHITECTURE §6.3) from the subscription.* webhooks. The mirror only says what the account page
// shows; credits come from subscription.payment_succeeded (fulfil.ts), never from these events.
// Waffo's statuses map onto the mirror's Stripe vocabulary: canceling is still active until the
// period ends, with cancel_at_period_end set.

export const SUBSCRIPTION_STATE_EVENTS = [
  'subscription.activated',
  'subscription.renewed',
  'subscription.recovered',
  'subscription.uncanceled',
  'subscription.canceling',
  'subscription.past_due',
  'subscription.canceled',
] as const

export type MirrorState = { status: 'active' | 'past_due' | 'canceled'; cancelAtPeriodEnd: boolean }

export function mirrorState(orderStatus: string): MirrorState | null {
  if (orderStatus === 'active' || orderStatus === 'trialing') return { status: 'active', cancelAtPeriodEnd: false }
  if (orderStatus === 'canceling') return { status: 'active', cancelAtPeriodEnd: true }
  if (orderStatus === 'past_due') return { status: 'past_due', cancelAtPeriodEnd: false }
  if (orderStatus === 'canceled' || orderStatus === 'expired') return { status: 'canceled', cancelAtPeriodEnd: false }
  return null
}

// Waffo sends dates ("2026-05-10", the period end) and timestamps; a bare date is that day,
// UTC midnight.
export function isoOf(value: string | undefined): string | null {
  if (!value) return null
  const time = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

const subscriptionSchema = z.object({
  orderId: z.string().regex(/^ORD_[A-Za-z0-9]+$/),
  orderStatus: z.string().min(1),
  orderMetadata: metadataSchema,
  currentPeriodEnd: z.string().optional(),
})

export type WaffoSubscriptionSync = {
  userId: string
  orderId: string
  productId: string
  state: MirrorState
  // Null keeps the period end already mirrored (Waffo omits it on some events).
  periodEnd: string | null
  // When Waffo says this happened: an older event never overwrites a newer one.
  eventAt: string
}

// sync_waffo_subscription (0360): upsert by waffo_order_id; refuses another user's or another
// product's order; ignores an event older than the last one applied; canceled is final. Returns
// whether the row changed.
export function syncWaffoSubscription(db: RpcClient, input: WaffoSubscriptionSync): Promise<boolean> {
  return callRpc(
    db,
    'sync_waffo_subscription',
    {
      p_user_id: input.userId,
      p_order_id: input.orderId,
      p_product_id: input.productId,
      p_status: input.state.status,
      p_current_period_end: input.periodEnd,
      p_cancel_at_period_end: input.state.cancelAtPeriodEnd,
      p_event_at: input.eventAt,
    },
    z.boolean(),
  )
}

export type SubscriptionEvent = { eventId: string; eventType: string; timestamp?: string; data: unknown }

// One subscription.* event → the mirror. 'ignored' for statuses the mirror does not hold
// (pending, closed: never paid).
export async function applySubscriptionEvent(db: RpcClient, event: SubscriptionEvent): Promise<'synced' | 'unchanged' | 'ignored'> {
  const parsed = subscriptionSchema.safeParse(event.data)
  if (!parsed.success) throw new AppError('INVALID_INPUT', `waffo ${event.eventType} ${event.eventId}: order fields`)
  const state = mirrorState(parsed.data.orderStatus)
  if (!state) return 'ignored'
  const eventAt = isoOf(event.timestamp) ?? new Date().toISOString()
  const changed = await syncWaffoSubscription(db, {
    userId: parsed.data.orderMetadata.user_id,
    orderId: parsed.data.orderId,
    productId: parsed.data.orderMetadata.product_id,
    state,
    periodEnd: isoOf(parsed.data.currentPeriodEnd),
    eventAt,
  })
  return changed ? 'synced' : 'unchanged'
}
