import { z } from 'zod'

import type { OwnerAlert, PaymentStep, RefundAlert } from '../../alerts'
import { metadataSchema, toCents } from './payment-facts'
import type { WaffoEvent } from './webhook'

// The Owner's Feishu alerts for Waffo (T72), built from the signed event body only.

const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/)

const orderSchema = z.object({
  orderMetadata: metadataSchema.optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  chargedAmount: money.optional(),
})

function stepOf(eventType: string): PaymentStep {
  if (eventType === 'order.completed') return 'purchase'
  if (eventType === 'subscription.payment_succeeded') return 'renewal'
  if (eventType.startsWith('subscription.')) return 'subscription'
  if (eventType.startsWith('refund.')) return 'refund'
  return 'other'
}

// A grant that failed: who and what come from our checkout's order metadata.
export function waffoFailureAlert(event: WaffoEvent): OwnerAlert {
  const step = stepOf(event.eventType)
  const order = orderSchema.safeParse(event.data)
  const facts = order.success && (step === 'purchase' || step === 'renewal') ? order.data : {}
  return {
    kind: 'payment_failed',
    channel: 'waffo',
    eventId: event.eventId,
    step,
    userId: facts.orderMetadata?.user_id ?? null,
    productId: facts.orderMetadata?.product_id ?? null,
    amount: facts.chargedAmount ? { cents: toCents(facts.chargedAmount), currency: (facts.currency ?? 'usd').toLowerCase() } : null,
  }
}

const refundSchema = z.object({ paymentId: z.string().min(1).optional() })

// refund.succeeded names the payment; the notifier reads user, product and amount from its row.
// The refunded amount is not in the payload we rely on, so the message gives the payment's.
export function waffoRefundAlert(event: WaffoEvent): RefundAlert {
  const refund = refundSchema.safeParse(event.data)
  return {
    kind: 'refund',
    channel: 'waffo',
    refundId: event.eventId,
    waffoPaymentId: refund.success ? (refund.data.paymentId ?? null) : null,
    userId: null,
    productId: null,
    amount: null,
    refunded: null,
    credits: null,
  }
}
