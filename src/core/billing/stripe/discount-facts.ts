import type Stripe from 'stripe'

import type { SiteProduct } from '../../config'

// Session totals and discounts use the same currency and minor units. The proportion
// against the undiscounted subtotal also works for zero- and three-decimal currencies.
function usd(minor: number, currency: string | null, subtotal: number | null, usdSubtotal: number): number {
  if (currency === 'usd') return minor / 100
  return subtotal && subtotal > 0 ? Math.round(100 * usdSubtotal * minor / subtotal) / 100 : 0
}

function priceUsd(price: Stripe.Price | null | undefined, product: SiteProduct) {
  return price?.currency === 'usd' && price.unit_amount != null ? price.unit_amount / 100 : product.priceUsd
}

function sessionSubtotalUsd(session: Stripe.Checkout.Session, product: SiteProduct) {
  if (session.currency === 'usd' && session.amount_subtotal != null) return session.amount_subtotal / 100
  if (session.currency_conversion?.source_currency === 'usd') return session.currency_conversion.amount_subtotal / 100
  return priceUsd(session.line_items?.data[0]?.price, product)
}

export function sessionDiscount(session: Stripe.Checkout.Session, product: SiteProduct) {
  const { code, code_id: codeId = null } = session.metadata ?? {}
  const minor = session.total_details?.amount_discount ?? 0
  const subtotal = sessionSubtotalUsd(session, product)
  const discountUsd = usd(minor, session.currency, session.amount_subtotal, subtotal)
  const props = codeId && code ? { code, amount_discount_usd: discountUsd } : {}
  return { codeId, amountDiscount: codeId ? minor : 0, amountUsd: Math.max(0, subtotal - discountUsd), props }
}

// Once coupons stop appearing on later invoices. Match the coupon on the invoice
// itself so another discount cannot be attributed to the original campaign.
function discountsForCode(invoice: Stripe.Invoice, codeId: string) {
  const ids = new Set<string>()
  for (const discount of invoice.discounts ?? []) {
    if (typeof discount === 'string') continue
    const coupon = discount.source.coupon
    if (typeof coupon === 'object' && coupon?.metadata?.code_id === codeId) ids.add(discount.id)
  }
  return ids
}

export function renewalAmounts(invoice: Stripe.Invoice, sub: Stripe.Subscription, product: SiteProduct) {
  const listedUsd = priceUsd(sub.items.data[0]?.price, product)
  const toUsd = (minor: number) => usd(minor, invoice.currency, invoice.subtotal, listedUsd)
  const { code, code_id: codeId } = sub.metadata
  const discounts = invoice.total_discount_amounts ?? []
  const allDiscounts = discounts.reduce((sum, item) => sum + item.amount, 0)
  const net = invoice.total_excluding_tax ?? (invoice.subtotal != null ? invoice.subtotal - allDiscounts : null)
  const amountUsd = net != null ? toUsd(net) : listedUsd
  if (!code || !codeId) return { amount_usd: amountUsd }
  const ids = discountsForCode(invoice, codeId)
  const minor = discounts.reduce((sum, item) => {
    const id = typeof item.discount === 'string' ? item.discount : item.discount.id
    return ids.has(id) ? sum + item.amount : sum
  }, 0)
  return { amount_usd: amountUsd, ...(minor > 0 && { code, amount_discount_usd: toUsd(minor) }) }
}
