import { COPY } from './copy'
import type { Payout } from './read'

export const payoutAmountHeaders = [
  COPY.originalAmount,
  COPY.currentPayable,
  COPY.reduction,
  COPY.paidAmount,
  COPY.feeAmount,
  COPY.netAmount,
]

export function payoutAmounts(r: Payout, format: (n: number) => string, empty: string) {
  // Historical paid payouts predate the separate actual amount and were always settled at face value.
  const paid = r.status === 'paid' ? r.paid_amount ?? r.amount : null
  const reviewed = paid ?? r.payable
  return [
    format(r.amount),
    r.payable === null ? empty : format(r.payable),
    reviewed === null ? empty : format(r.amount - reviewed),
    paid === null ? empty : format(paid),
    r.fees === null ? empty : format(r.fees.fees),
    r.fees === null ? empty : format(r.fees.net),
  ]
}

/** One line per deduction, e.g. "提现手续费 3.5% + US$0.50：US$7.50". */
export function feeLineTexts(r: Payout, format: (n: number) => string) {
  return (r.fees?.lines ?? []).map((line) => line.label_zh + '：' + format(line.amount))
}
