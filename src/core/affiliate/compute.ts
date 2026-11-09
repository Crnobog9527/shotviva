// All inputs and the result are integer cents or basis points. BigInt also protects
// the intermediate product when a valid payment exceeds Number's exact range.
export function commissionCents(total: number, tax: number, refunded: number, rateBp: number, lost = false): number {
  if (lost || total <= 0) return 0
  const numerator = BigInt(total - tax) * BigInt(total - refunded) * BigInt(rateBp)
  return Number(numerator / (BigInt(total) * BigInt(10000)))
}
