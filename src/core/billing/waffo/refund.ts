import 'server-only'

import { z } from 'zod'

import { notifyOwner, type RefundAlert } from '../../alerts'
import { captureAlert } from '../../analytics/capture-error'
import { logger } from '../../logger'
import { callRpc, type RpcClient } from '../rpc'
import type { CancelRefunded } from '../subscription/cancel-others'
import { waffoRefundAlert } from './failure-alert'
import { toCents } from './payment-facts'
import type { WaffoEvent } from './webhook'

// refund.succeeded (ARCHITECTURE §6.2 「Waffo 退款与 Stripe 同一规则、同一函数」, T71). Waffo sends
// this refund's own amount (refundedAmount, or the deprecated amount), never the running total
// (docs.waffo.ai Webhooks), so record_waffo_refund adds it once per event id, then takes the
// credits back and ends a refunded membership like Stripe's record_payment_issue. A membership's
// card subscription is cancelled here (Waffo can only stop it at the period end; our mirror
// records it ended now, as an upgrade does). No amount on the event counts as the whole rest.

export type WaffoRefundDeps = { db: RpcClient; cancelRefunded?: CancelRefunded }

export type WaffoRefundOutcome = 'recorded' | 'unknown_payment' | 'not_succeeded'

const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/)

const refundSchema = z.object({
  paymentId: z.string().regex(/^PAY_/).optional(),
  refundedAmount: money.optional(),
  amount: money.optional(),
  refundStatus: z.string().optional(),
})

const recordedSchema = z
  .object({
    payment_id: z.number().int(),
    user_id: z.uuid(),
    product_id: z.string(),
    status: z.string(),
    amount_total: z.number().int(),
    amount_refunded: z.number().int(),
    currency: z.string(),
    credits_clawed_back: z.number().int(),
    clawback_shortfall: z.number().int(),
    membership_ended: z.boolean(),
    waffo_order_id: z.string().nullable(),
  })
  .nullable()

type Recorded = NonNullable<z.infer<typeof recordedSchema>>

function ownerAlert(event: WaffoEvent, row: Recorded, refundedCents: number | null): RefundAlert {
  return {
    ...waffoRefundAlert(event),
    // Already known: the notifier need not look the payment up again.
    waffoPaymentId: null,
    userId: row.user_id,
    productId: row.product_id,
    amount: { cents: row.amount_total, currency: row.currency },
    refunded: refundedCents === null ? null : { cents: refundedCents, currency: row.currency },
    credits: { clawedBack: row.credits_clawed_back, shortfall: row.clawback_shortfall },
  }
}

function report(event: WaffoEvent, row: Recorded): void {
  const fields = {
    event_id: event.eventId,
    payment_id: row.payment_id,
    user_id: row.user_id,
    product_id: row.product_id,
    status: row.status,
    amount_refunded: row.amount_refunded,
    credits_clawed_back: row.credits_clawed_back,
    clawback_shortfall: row.clawback_shortfall,
    membership_ended: row.membership_ended,
  }
  logger.warn('waffo refund recorded', fields)
  captureAlert('charge_refunded', `Waffo refund ${event.eventId}: ${row.credits_clawed_back} credits clawed back`, { fields })
  if (row.clawback_shortfall > 0) {
    captureAlert('clawback_shortfall', `Waffo refund ${event.eventId}: ${row.clawback_shortfall} credits could not be clawed back (already spent)`, { fields })
  }
}

type ParsedRefund = { paymentId: string | null; cents: number | null; succeeded: boolean }

function parseRefund(event: WaffoEvent): ParsedRefund {
  const data = refundSchema.safeParse(event.data)
  const refund = data.success ? data.data : {}
  const amount = refund.refundedAmount ?? refund.amount
  return {
    paymentId: refund.paymentId ?? null,
    cents: amount === undefined ? null : toCents(amount),
    succeeded: !refund.refundStatus || refund.refundStatus === 'succeeded',
  }
}

function unknownPayment(event: WaffoEvent, paymentId: string | null): WaffoRefundOutcome {
  const fields = { event_id: event.eventId, payment_id: paymentId ?? '', known_payment: false }
  logger.warn('waffo refund for an unknown payment', fields)
  captureAlert('charge_refunded', 'Waffo refund.succeeded for a payment we have no row for: adjust credits by hand', { fields })
  notifyOwner(waffoRefundAlert(event))
  return 'unknown_payment'
}

// Throws on a database failure, so the webhook answers 500 and Waffo redelivers.
export async function recordWaffoRefund(deps: WaffoRefundDeps, event: WaffoEvent): Promise<WaffoRefundOutcome> {
  const refund = parseRefund(event)
  if (!refund.succeeded) return 'not_succeeded'
  const row = refund.paymentId
    ? await callRpc(deps.db, 'record_waffo_refund', { p_payment_id: refund.paymentId, p_refund_ref: event.eventId, p_amount: refund.cents }, recordedSchema)
    : null
  if (!row) return unknownPayment(event, refund.paymentId)
  report(event, row)
  // Never throws: a failed cancel is alerted for the Owner (T66's cancel path).
  if (row.membership_ended && row.waffo_order_id) await deps.cancelRefunded?.(row.user_id, { waffoOrderId: row.waffo_order_id })
  notifyOwner(ownerAlert(event, row, refund.cents))
  return 'recorded'
}
