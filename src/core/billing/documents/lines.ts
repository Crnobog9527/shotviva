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
  refund: 'full' | 'partial' | null
}

// Logical path of the redirect route; the caller localizes it.
export function documentPath(paymentId: string, document: PaymentDocument): string {
  return `/account/purchases/${encodeURIComponent(paymentId)}/${document}`
}

// Every Stripe charge has a receipt (refunded ones too: the page shows the refund). Only rows
// with an invoice id get 「发票」: subscriptions, and one-time Managed Payments purchases,
// which Stripe invoices as "Sold through Link". Waffo's API has neither (its buyer gets an
// order confirmation email), so its rows get the email note instead of links.
export function purchaseLine(row: DocumentRow, label: string, locale: Locale): PurchaseLine {
  const stripe = row.channel === 'stripe'
  const href = (document: PaymentDocument) => localizePath(documentPath(row.id, document), locale)
  return {
    value: row.id,
    label,
    receiptHref: stripe ? href('receipt') : null,
    invoiceHref: stripe && row.hasInvoice ? href('invoice') : null,
    refund: row.status === 'refunded' ? 'full' : row.status === 'partially_refunded' ? 'partial' : null,
  }
}

// The worded choices (support's paymentChoices) are in the same order as the rows they came from.
export function purchaseLines(rows: readonly DocumentRow[], choices: readonly { value: string; label: string }[], locale: Locale): PurchaseLine[] {
  const labels = new Map(choices.map((choice) => [choice.value, choice.label]))
  return rows.map((row) => purchaseLine(row, labels.get(row.id) ?? row.id, locale))
}
