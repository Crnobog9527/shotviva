// Where a payment came from (ARCHITECTURE §6.1 payments): a Stripe row with a Checkout Session
// is a first payment or one-off; a Stripe row with only an invoice is a renewal (T10). On Waffo
// a membership paid by card is a card subscription (T50): every charge of it, first or renewal,
// is a subscription charge; anything else (Alipay periods, packs) is a one-time payment.
// (Before, every Waffo row read 「Waffo 单笔」, found checking Codex's Waffo run for T66.)
export type PurchaseChannel = 'stripe' | 'waffo'
export type PurchaseForm = 'checkout' | 'renewal' | 'waffo' | 'waffo_subscription'

export type PaymentIds = {
  channel: PurchaseChannel
  product_id: string
  method: string
  stripe_session_id: string | null
  stripe_invoice_id: string | null
  stripe_charge_id: string | null
  waffo_order_id: string | null
}

export type PurchaseSource = { channel: PurchaseChannel; form: PurchaseForm; providerId: string | null }

// The id the Stripe link opens: the charge (refunds and disputes live there), else the invoice
// or session. Waffo rows show their order id and no Stripe link.
export function paymentSource(row: PaymentIds): PurchaseSource {
  if (row.channel === 'waffo') {
    const subscription = row.method === 'card' && !row.product_id.startsWith('pack_')
    return { channel: 'waffo', form: subscription ? 'waffo_subscription' : 'waffo', providerId: row.waffo_order_id }
  }
  const form = row.stripe_session_id ? 'checkout' : 'renewal'
  return { channel: 'stripe', form, providerId: row.stripe_charge_id ?? row.stripe_invoice_id ?? row.stripe_session_id }
}

// Stripe Dashboard search finds charges, sessions, invoices and subscriptions by id, so one link
// shape covers all. Test paths everywhere except production (VERCEL_ENV).
export function stripeDashboardUrl(id: string, live: boolean): string {
  return `https://dashboard.stripe.com/${live ? '' : 'test/'}search?query=${encodeURIComponent(id)}`
}
