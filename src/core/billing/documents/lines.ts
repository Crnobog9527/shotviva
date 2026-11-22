import { localizePath } from '../../i18n/paths'
import type { Locale } from '../../i18n/locales'

// The account page's Purchases list with its receipt and invoice links (ARCHITECTURE §6.3
// 「账号页购买记录里下载收据和发票」, T80). Pure, so the page decides on the server which
// links a row gets; the provider's own link is only fetched when one is clicked
// (resolve.ts, behind documentPath), never put in the page.

export const PAYMENT_DOCUMENTS = ['receipt', 'invoice'] as const
export type PaymentDocument = (typeof PAYMENT_DOCUMENTS)[number]

// What the payments row says, enough to know which links can work without asking Stripe.
export type DocumentRow = {
  id: string
  channel: 'stripe' | 'waffo'
  status: 'paid' | 'refunded' | 'partially_refunded' | 'disputed'
  hasInvoice: boolean
}

// One line of the list: the server-worded label, our own redirect paths (null where the
// provider has nothing to open) and the refund mark.
export type PurchaseLine = {
  value: string
  label: string
  receiptHref: string | null
  invoiceHref: string | null
  // Waffo rows only: the Waffo Consumer Portal, where the buyer downloads PDF invoices and edits
  // the company name and tax ID on them.
  portalHref: string | null
  refund: 'full' | 'partial' | null
}

// Waffo's own buyer portal (docs.waffo.ai/features/customer-portal). The buyer signs in there
// with their payment email; we have no per-order invoice link to put in the page.
export const WAFFO_CONSUMER_PORTAL = 'https://pancake.waffo.ai/consumer/portal/login'

// Logical path of the redirect route; the caller localizes it.
export function documentPath(paymentId: string, document: PaymentDocument): string {
  return `/account/purchases/${encodeURIComponent(paymentId)}/${document}`
}

// Every Stripe charge has a receipt (refunded ones too: the page shows the refund), whatever
// the method: card, 中国银行卡, Alipay, WeChat Pay. Only rows
// with an invoice id get 「发票」: subscriptions, and one-time Managed Payments purchases,
// which Stripe invoices as "Sold through Link". Waffo does send invoices, in the order
// confirmation email and in its Consumer Portal (PDF, editable company name and tax ID), but its
// API has no per-order receipt or invoice link, so its rows get that note and the portal link.
export function purchaseLine(row: DocumentRow, label: string, locale: Locale): PurchaseLine {
  const stripe = row.channel === 'stripe'
  const href = (document: PaymentDocument) => localizePath(documentPath(row.id, document), locale)
  return {
    value: row.id,
    label,
    receiptHref: stripe ? href('receipt') : null,
    invoiceHref: stripe && row.hasInvoice ? href('invoice') : null,
    portalHref: row.channel === 'waffo' ? WAFFO_CONSUMER_PORTAL : null,
    refund: row.status === 'refunded' ? 'full' : row.status === 'partially_refunded' ? 'partial' : null,
  }
}

// The worded choices (support's paymentChoices) are in the same order as the rows they came from.
export function purchaseLines(rows: readonly DocumentRow[], choices: readonly { value: string; label: string }[], locale: Locale): PurchaseLine[] {
  const labels = new Map(choices.map((choice) => [choice.value, choice.label]))
  return rows.map((row) => purchaseLine(row, labels.get(row.id) ?? row.id, locale))
}
