import { COPY } from './copy'
import type { Payout } from './read'

export const payoutAmountHeaders = [COPY.originalAmount, COPY.currentPayable, COPY.reduction, COPY.paidAmount]

export function payoutAmounts(r: Payout, format: (n: number) => string, empty: string) {
  // Historical paid payouts predate the separate actual amount and were always settled at face value.
  const paid = r.status === 'paid' ? r.paid_amount ?? r.amount : null
  const reviewed = paid ?? r.payable
  return [
    format(r.amount),
    r.payable === null ? empty : format(r.payable),
    reviewed === null ? empty : format(r.amount - reviewed),
    paid === null ? empty : format(paid),
  ]
}
