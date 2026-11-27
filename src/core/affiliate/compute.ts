// All inputs and the result are integer cents or basis points. BigInt also protects
// the intermediate product when a valid payment exceeds Number's exact range.
export function commissionCents(total: number, tax: number, refunded: number, rateBp: number, lost = false): number {
  if (lost || total <= 0) return 0
  const numerator = BigInt(total - tax) * BigInt(total - refunded) * BigInt(rateBp)
  return Number(numerator / (BigInt(total) * BigInt(10000)))
}

// F5 (migration 1740): the base after tax, refunds and this payment's fees, floor 0. The fee is
// deducted in full from the unrefunded part; a full refund gives 0.
export function netBaseCents(total: number, tax: number, refunded: number, feeCents: number): number {
  if (total <= 0) return 0
  const unrefunded = (BigInt(total - tax) * BigInt(total - refunded)) / BigInt(total)
  const base = unrefunded - BigInt(feeCents)
  return base > BigInt(0) ? Number(base) : 0
}

// A payment with fee data (payments.fee_status set) earns on the net base; feeCents null is the
// old formula, unchanged.
export function feeAwareCommissionCents(
  total: number, tax: number, refunded: number, rateBp: number, feeCents: number | null, lost = false,
): number {
  if (feeCents === null) return commissionCents(total, tax, refunded, rateBp, lost)
  if (lost) return 0
  return Number((BigInt(netBaseCents(total, tax, refunded, feeCents)) * BigInt(rateBp)) / BigInt(10000))
}
