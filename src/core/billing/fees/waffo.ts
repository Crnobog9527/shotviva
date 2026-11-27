import 'server-only'

import type { RpcClient } from '../rpc'
import { feeTarget, outcomeOf, priced, safely, writeFees, type FeeOutcome, type FeeTarget, type FeeWrite } from './record'

// F3, Waffo (ARCHITECTURE §6.2 订单手续费, F1 §3). Neither the webhook nor anything else Waffo has
// at payment time carries the fee: the real figure (GraphQL Payment.settlementInfo.feeAmount)
// appears only when the payment settles, about ten days later, and writing it is the daily
// reconciliation's job (F4, source waffo_settlement). Until then each charge carries the
// published rate for the method Waffo actually charged (payments.method, F0): card, Apple Pay and
// Google Pay 3.9% + $0.50, WeChat Pay and Alipay 3.9% with no fixed fee (the Owner, 2026-11-21),
// rounded up to the cent, on the tax-inclusive amount charged. A card refund costs $1.

export function waffoChargeWrite(target: FeeTarget, paymentRef: string): FeeWrite | null {
  const acquiring = priced(target, 'acquiring', 'estimate', { source_ref: paymentRef })
  if (!acquiring || target.currency !== 'usd') return null
  return { payment_id: target.payment_id, idempotency_key: `estimate:${target.payment_id}`, basis_cents: target.amount_total, lines: [acquiring] }
}

// `refundRef` is the refund.succeeded event id, the same reference payment_refunds keys the
// refund by. Only a method with a published refund fee (card) gets a line.
export function waffoRefundWrite(target: FeeTarget, refundRef: string, refundCents: number | null): FeeWrite | null {
  const fee = priced(target, 'refund_fee', 'estimate', { source_ref: refundRef })
  if (!fee || target.currency !== 'usd') return null
  return {
    payment_id: target.payment_id,
    idempotency_key: `estimate:refund:${refundRef}`,
    refund_id: refundRef,
    basis_cents: refundCents ?? target.amount_total,
    lines: [fee],
  }
}

// After settle_waffo_order / settle_waffo_renewal_v2 recorded the charge (PAY_…). Never throws.
export function recordWaffoFees(db: RpcClient, paymentRef: string): Promise<FeeOutcome> {
  return safely({ channel: 'waffo', ref: paymentRef }, async () => {
    const target = await feeTarget(db, { ref: paymentRef })
    if (typeof target === 'string') return target
    const write = waffoChargeWrite(target, paymentRef)
    return write ? outcomeOf(await writeFees(db, write)) : 'skipped'
  })
}

// After record_waffo_refund recorded the refund on payments row `paymentId`. Never throws.
export function recordWaffoRefundFee(db: RpcClient, at: { paymentId: number; refundRef: string; refundCents: number | null }): Promise<FeeOutcome> {
  return safely({ channel: 'waffo', payment_row: at.paymentId, refund_ref: at.refundRef }, async () => {
    const target = await feeTarget(db, { paymentId: at.paymentId })
    if (typeof target === 'string') return target
    const write = waffoRefundWrite(target, at.refundRef, at.refundCents)
    return write ? outcomeOf(await writeFees(db, write)) : 'skipped'
  })
}
