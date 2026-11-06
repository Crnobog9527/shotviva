// Where a payment came from (ARCHITECTURE §6.1 payments): a Stripe row with a Checkout Session
// is a first payment or one-off; a Stripe row with only an invoice is a renewal (T10); a Waffo
// row is a Waffo one-time payment.
export type PurchaseChannel = 'stripe' | 'waffo'
export type PurchaseForm = 'checkout' | 'renewal' | 'waffo'

export type PaymentIds = {
  channel: PurchaseChannel
  stripe_session_id: string | null
  stripe_invoice_id: string | null
  stripe_charge_id: string | null
  waffo_order_id: string | null
}

export type PurchaseSource = { channel: PurchaseChannel; form: PurchaseForm; providerId: string | null }

// The id the Stripe link opens: the charge (refunds and disputes live there), else the invoice
// or session. Waffo rows show their order id and no Stripe link.
export function paymentSource(row: PaymentIds): PurchaseSource {
  if (row.channel === 'waffo') return { channel: 'waffo', form: 'waffo', providerId: row.waffo_order_id }
  const form = row.stripe_session_id ? 'checkout' : 'renewal'
  return { channel: 'stripe', form, providerId: row.stripe_charge_id ?? row.stripe_invoice_id ?? row.stripe_session_id }
}

// Stripe Dashboard search finds charges, sessions, invoices and subscriptions by id, so one link
// shape covers all. Test paths everywhere except production (VERCEL_ENV).
export function stripeDashboardUrl(id: string, live: boolean): string {
  return `https://dashboard.stripe.com/${live ? '' : 'test/'}search?query=${encodeURIComponent(id)}`
}
