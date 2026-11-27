// Unit price of an org package: USD per 100 credits, computed from the package's own price and
// credits (never typed in). Two decimals, or three when rounding to two would drop a non-zero
// digit: $5000.00 for 833333 credits is 0.60, not 0.6000…. Null when the package has no credits.
export function unitPricePer100Credits(priceUsdCents: number, credits: number): string | null {
  if (!Number.isFinite(priceUsdCents) || !Number.isFinite(credits) || credits <= 0 || priceUsdCents < 0) return null
  // dollars per 100 credits = (cents / 100) * (100 / credits) = cents / credits; as thousandths.
  const milli = Math.round((priceUsdCents * 1000) / credits)
  const digits = milli % 10 === 0 ? 2 : 3
  return (milli / 1000).toFixed(digits)
}
