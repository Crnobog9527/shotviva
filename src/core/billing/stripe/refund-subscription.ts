import 'server-only'

import type Stripe from 'stripe'

import { notifyOwner } from '../../alerts'
import { captureAlert } from '../../analytics/capture-error'
import { logger } from '../../logger'
import type { FulfilDeps } from './fulfil'

// A refunded membership ends at once (ARCHITECTURE §6.2 「会员退款」, T71): record_payment_issue has
// moved paid_until back; here the subscription that payment belongs to stops renewing, cancelled
// now with no proration and no final invoice (T66's cancel, through deps.cancelRefunded). The
// subscription is read from Stripe: a first payment's Checkout Session names it, a renewal's
// invoice does. A wallet purchase (one period, no subscription) has nothing to cancel.
// Never throws: the refund is recorded already, and a failed cancel is alerted for the Owner.

type RefundedPayment = { user_id: string; product_id: string; stripe_session_id?: string | null; stripe_invoice_id?: string | null }

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : (value?.id ?? null))

async function subscriptionOf(stripe: FulfilDeps['stripe'], payment: RefundedPayment): Promise<string | null> {
  if (payment.stripe_invoice_id) {
    const invoice: Stripe.Invoice = await stripe.invoices.retrieve(payment.stripe_invoice_id)
    return idOf(invoice.parent?.subscription_details?.subscription)
  }
  if (payment.stripe_session_id) return idOf((await stripe.checkout.sessions.retrieve(payment.stripe_session_id)).subscription)
  return null
}

export async function cancelRefundedMembership(deps: FulfilDeps, payment: RefundedPayment): Promise<void> {
  if (!deps.cancelRefunded) return
  try {
    const subscriptionId = await subscriptionOf(deps.stripe, payment)
    if (!subscriptionId) return
    const outcome = await deps.cancelRefunded(payment.user_id, { stripeSubscriptionId: subscriptionId })
    logger.info('refunded membership subscription', { user_id: payment.user_id, subscription: subscriptionId, outcome })
  } catch (error) {
    logger.error('refunded membership: subscription lookup failed', { user_id: payment.user_id, error })
    captureAlert('subscription_cancel_failed', 'Membership refunded but its subscription could not be read: check by hand', {
      fields: { user_id: payment.user_id, product_id: payment.product_id, cause: 'refund' },
    })
    notifyOwner({ kind: 'subscription_cancel_failed', userId: payment.user_id, channel: 'stripe', productId: payment.product_id, subscriptionRef: null, cause: 'refund' })
  }
}
