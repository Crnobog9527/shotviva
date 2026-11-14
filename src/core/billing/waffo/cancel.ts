import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import type { RpcClient } from '../rpc'
import type { WaffoApi } from './client'
import { isoOf, mirrorState, syncWaffoSubscription } from './subscription-sync'

// "Cancel subscription" on the account page (T50, ARCHITECTURE §6.3): the one cancel the site
// performs itself, because Waffo gives us no hosted portal. Only the signed-in user's own live
// Waffo order is touched, read from the mirror (subscriptions_user_id_idx). Waffo cancels at the
// period end (active → canceling); the mirror is updated at once so the page says "Ends …", and
// the subscription.canceling webhook confirms the same state later.

const liveRow = z.object({ waffo_order_id: z.string(), product_id: z.string() })

export type CancelDeps = { db: SupabaseClient & RpcClient; waffo: Pick<WaffoApi, 'cancelSubscription'>; now?: () => Date }

async function liveOrder(db: SupabaseClient, userId: string): Promise<z.infer<typeof liveRow> | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select('waffo_order_id, product_id')
    .eq('user_id', userId)
    .eq('provider', 'waffo')
    .in('status', ['active', 'past_due'])
    .eq('cancel_at_period_end', false)
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `waffo cancel: mirror read failed: ${error.message}`)
  return data === null ? null : liveRow.parse(data)
}

export async function cancelWaffoSubscription(deps: CancelDeps, userId: string): Promise<'canceling' | 'canceled'> {
  const order = await liveOrder(deps.db, userId)
  if (!order) throw new AppError('NOT_FOUND', 'no Waffo subscription to cancel')
  const result = await deps.waffo.cancelSubscription(order.waffo_order_id)
  const state = mirrorState(result.status) ?? { status: 'active', cancelAtPeriodEnd: true }
  await syncWaffoSubscription(deps.db, {
    userId,
    orderId: order.waffo_order_id,
    productId: order.product_id,
    state,
    periodEnd: isoOf(result.currentPeriodEnd),
    eventAt: (deps.now ?? (() => new Date()))().toISOString(),
  })
  logger.info('waffo subscription cancelled by user', { orderId: order.waffo_order_id, status: result.status })
  return state.status === 'canceled' ? 'canceled' : 'canceling'
}
