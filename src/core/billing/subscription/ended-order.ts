import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { notifyOwner } from '../../alerts'
import { captureAlert } from '../../analytics/capture-error'
import { AppError } from '../../errors'
import { logger } from '../../logger'
import type { WaffoApi } from '../waffo/client'

// A Waffo order an upgrade ended (T66). Waffo cannot end an active subscription at once:
// cancel-order leaves it `canceling` until its period end, and the buyer could still resume it
// from Waffo's customer portal. Our mirror marks it `canceled` at the upgrade time
// (cancel-others.ts), so anything Waffo reports for that order after that moment, a charge or
// a reactivation, is refused here: no credits, the order is cancelled again, and the Owner is
// alerted (the same 「旧订阅没取消」 alert) to refund a charge by hand. A subscription that ended
// the ordinary way has no charge after its end either, so the rule reads the same for it.

export type EndedOrderDeps = { admin: SupabaseClient; waffo: () => Pick<WaffoApi, 'cancelSubscription'> }

export type EndedOrderInput = { orderId: string; at: string; what: 'charge' | 'reactivation' }

// What the Waffo webhook is handed: refuseEndedOrder bound to its clients.
export type RefuseEnded = (input: EndedOrderInput) => Promise<boolean>

const rowSchema = z.object({ user_id: z.string(), product_id: z.string(), status: z.string(), current_period_end: z.string() })

// subscriptions.waffo_order_id is unique (0361), so this is one index lookup.
async function mirrorRow(admin: SupabaseClient, orderId: string): Promise<z.infer<typeof rowSchema> | null> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('user_id, product_id, status, current_period_end')
    .eq('waffo_order_id', orderId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `ended order: mirror read failed: ${error.message}`)
  return data === null ? null : rowSchema.parse(data)
}

// True when the order ended before `at`: the caller must grant nothing.
export async function refuseEndedOrder(deps: EndedOrderDeps, input: EndedOrderInput): Promise<boolean> {
  const row = await mirrorRow(deps.admin, input.orderId)
  if (!row || row.status !== 'canceled' || Date.parse(input.at) <= Date.parse(row.current_period_end)) return false
  const fields = { user_id: row.user_id, provider: 'waffo', subscription: input.orderId, product_id: row.product_id, what: input.what }
  logger.error('waffo order ended by an upgrade came back', fields)
  captureAlert('subscription_cancel_failed', `A ${input.what} on a Waffo order an upgrade ended: nothing granted; refund / cancel by hand`, { fields })
  notifyOwner({ kind: 'subscription_cancel_failed', userId: row.user_id, channel: 'waffo', productId: row.product_id, subscriptionRef: input.orderId })
  try {
    await deps.waffo().cancelSubscription(input.orderId)
  } catch (error) {
    // Already canceling or canceled answers 400; either way the alert above stands.
    logger.warn('waffo re-cancel of an ended order failed', { orderId: input.orderId, error })
  }
  return true
}
