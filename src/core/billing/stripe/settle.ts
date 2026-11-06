import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import type { ProductId } from '../../config'
import { AppError } from '../../errors'
import { creditChangeSchema, type CreditChange } from '../credits'
import { callRpc, type RpcClient } from '../rpc'
import type { PaymentFacts } from './payment-facts'

// settle_checkout (0083, payments row since 0101): the subscription mirror, the grant and the
// payment record in one call and one transaction (AGENTS §5.1). Keyed by the session id, so a
// replay grants and records nothing.

export type SubscriptionState = {
  id: string
  status: Stripe.Subscription.Status
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

// Recent API versions keep the period on the item; a subscription here has exactly one.
// A cancellation can arrive two ways: cancel_at_period_end, or (flexible billing mode, which
// the Customer Portal uses) cancel_at set to a moment inside the current period with
// cancel_at_period_end still false. Both mean "no more renewals"; the plan then ends at
// cancel_at. A cancel_at beyond this period is a later end, so this period still renews.
export function subscriptionState(sub: Stripe.Subscription): SubscriptionState {
  const periodEnd = sub.items.data[0]?.current_period_end
  if (typeof periodEnd !== 'number') throw new AppError('INTERNAL', `subscription ${sub.id} has no period end`)
  const endsAt = sub.cancel_at !== null && sub.cancel_at !== undefined && sub.cancel_at <= periodEnd ? sub.cancel_at : null
  return {
    id: sub.id,
    status: sub.status,
    currentPeriodEnd: new Date((endsAt ?? periodEnd) * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end || endsAt !== null,
  }
}

const inputSchema = z.object({ userId: z.uuid(), productId: z.string().min(1), sessionId: z.string().startsWith('cs_') })

export async function settleCheckout(
  client: RpcClient,
  input: {
    userId: string
    productId: ProductId
    sessionId: string
    subscription: SubscriptionState | null
    payment: PaymentFacts
  },
): Promise<CreditChange> {
  const args = inputSchema.parse(input)
  const sub = input.subscription
  const pay = input.payment
  return callRpc(
    client,
    'settle_checkout',
    {
      p_user_id: args.userId,
      p_product_id: args.productId,
      p_session_id: args.sessionId,
      p_amount_total: pay.amountTotal,
      p_amount_tax: pay.amountTax,
      p_currency: pay.currency,
      p_method: pay.method,
      p_invoice_id: pay.invoiceId,
      p_charge_id: pay.chargeId,
      p_subscription_id: sub?.id ?? null,
      p_subscription_status: sub?.status ?? null,
      p_current_period_end: sub?.currentPeriodEnd.toISOString() ?? null,
      p_cancel_at_period_end: sub?.cancelAtPeriodEnd ?? null,
    },
    creditChangeSchema,
  )
}
