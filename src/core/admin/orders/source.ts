// Where a ledger purchase came from, read off its idempotency key (Plan A, control
// 2026-11-06). Same rule as admin_revenue_stats (0167):
//   purchase:cs_…  Stripe Checkout (first payment or one-off)
//   …:in_…         Stripe invoice (T10 renewals)
//   anything else  Waffo
export type PurchaseChannel = 'stripe' | 'waffo'
export type PurchaseForm = 'checkout' | 'renewal' | 'waffo'

export type PurchaseSource = { channel: PurchaseChannel; form: PurchaseForm; providerId: string | null }

export function purchaseSource(idempotencyKey: string): PurchaseSource {
  const id = idempotencyKey.slice(idempotencyKey.indexOf(':') + 1)
  if (/^cs_/.test(id)) return { channel: 'stripe', form: 'checkout', providerId: id }
  if (/^in_/.test(id)) return { channel: 'stripe', form: 'renewal', providerId: id }
  return { channel: 'waffo', form: 'waffo', providerId: id || null }
}

// Stripe Dashboard search finds sessions, invoices and subscriptions by id, so one link shape
// covers all. Test paths everywhere except production (VERCEL_ENV).
export function stripeDashboardUrl(id: string, live: boolean): string {
  return `https://dashboard.stripe.com/${live ? '' : 'test/'}search?query=${encodeURIComponent(id)}`
}
