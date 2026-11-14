export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// payments amounts are in the currency's smallest unit (Stripe's convention): cents for USD,
// whole yen for JPY. Intl knows each currency's minor digits.
export function formatMinor(amount: number, currency: string): string {
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  return format.format(amount / 10 ** digits)
}
