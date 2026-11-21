import { z } from 'zod'

const cents = z.number().int().safe()
const id = z.union([z.number().int().safe(), z.string().regex(/^\d+$/)]).transform(String)

// Only what a partner may see: no provider ids (source_ref), notes or idempotency keys.
export const feeLineColumns = 'payment_id,refund_id,revision,line_no,kind,channel,rate_bp,fixed_cents,amount_cents,source,status'
export const paymentColumns = 'id,channel,method,amount_total,amount_tax,amount_refunded,fee_status'

export const feeLineSchema = z.object({
  payment_id: id,
  refund_id: z.string().nullable(),
  revision: z.number().int(),
  line_no: z.number().int(),
  kind: z.string(),
  channel: z.string(),
  rate_bp: z.number().int().nullable(),
  fixed_cents: z.number().int().nullable(),
  amount_cents: cents,
  source: z.string(),
  status: z.enum(['estimated', 'final']),
})
export const orderPaymentSchema = z.object({
  id,
  channel: z.string(),
  method: z.string(),
  amount_total: cents,
  amount_tax: cents,
  amount_refunded: cents,
  fee_status: z.enum(['estimated', 'final']).nullable(),
})
export type FeeLine = z.infer<typeof feeLineSchema>
export type OrderPayment = z.infer<typeof orderPaymentSchema>
export type OrderFees = { payment: OrderPayment; lines: FeeLine[] }

// The lines that count now: the latest revision of the charge scope and of every refund scope
// (payment_fee_lines_current, in TypeScript so one query covers a whole page of payments).
export function currentLines(lines: FeeLine[]): FeeLine[] {
  const latest = new Map<string, number>()
  const scope = (l: FeeLine) => l.payment_id + '|' + (l.refund_id ?? '')
  for (const l of lines) latest.set(scope(l), Math.max(latest.get(scope(l)) ?? 0, l.revision))
  return lines
    .filter((l) => l.revision === latest.get(scope(l)))
    .sort((a, b) => (a.refund_id ?? '').localeCompare(b.refund_id ?? '') || a.line_no - b.line_no)
}

export function groupOrderFees(payments: OrderPayment[], lines: FeeLine[]): Map<string, OrderFees> {
  const byPayment = Map.groupBy(lines, (l) => l.payment_id)
  return new Map(payments.map((p) => [p.id, { payment: p, lines: currentLines(byPayment.get(p.id) ?? []) }]))
}

// Real provider numbers (Stripe balance transaction, Waffo settlement) versus a published-rate calculation.
export const isRealBill = (line: Pick<FeeLine, 'source'>) => line.source === 'stripe_bt' || line.source === 'waffo_settlement'

/** The part of the pre-tax payment that has not been refunded: what the commission base starts from. */
export function unrefundedBase(payment: Pick<OrderPayment, 'amount_total' | 'amount_tax' | 'amount_refunded'>) {
  if (payment.amount_total <= 0) return 0
  const pretax = payment.amount_total - payment.amount_tax
  return Math.floor((pretax * (payment.amount_total - payment.amount_refunded)) / payment.amount_total)
}
