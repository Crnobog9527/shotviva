import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import type { ProductId } from '../../config'
import { AppError } from '../../errors'
import { creditChangeSchema, type CreditChange } from '../credits'
import { callRpc, type RpcClient } from '../rpc'

// settle_checkout (0083): the subscription mirror and the grant in one call and one
// transaction (AGENTS §5.1). Keyed by the session id, so a replay grants nothing.

export type SubscriptionState = {
  id: string
  status: Stripe.Subscription.Status
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

// Recent API versions keep the period on the item; a subscription here has exactly one.
export function subscriptionState(sub: Stripe.Subscription): SubscriptionState {
  const periodEnd = sub.items.data[0]?.current_period_end
  if (typeof periodEnd !== 'number') throw new AppError('INTERNAL', `subscription ${sub.id} has no period end`)
  return {
    id: sub.id,
    status: sub.status,
    currentPeriodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  }
}

const inputSchema = z.object({ userId: z.uuid(), productId: z.string().min(1), sessionId: z.string().startsWith('cs_') })

export async function settleCheckout(
  client: RpcClient,
  input: { userId: string; productId: ProductId; sessionId: string; subscription: SubscriptionState | null },
): Promise<CreditChange> {
  const args = inputSchema.parse(input)
  const sub = input.subscription
  return callRpc(
    client,
    'settle_checkout',
    {
      p_user_id: args.userId,
      p_product_id: args.productId,
      p_session_id: args.sessionId,
      p_subscription_id: sub?.id ?? null,
      p_subscription_status: sub?.status ?? null,
      p_current_period_end: sub?.currentPeriodEnd.toISOString() ?? null,
      p_cancel_at_period_end: sub?.cancelAtPeriodEnd ?? null,
    },
    creditChangeSchema,
  )
}
