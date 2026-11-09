import type { SiteProduct } from '../config'
import { jobRef } from '../jobs/ref'
import type { Translate } from '../translate'
import type { PaymentOption, WorkOption } from './types'

// The submit form's pickers, worded on the server (app.support.product / app.support.new) so
// the client gets plain labels. Money in the payment's own currency, as charged.

// ref: a work's reference number (T78), as long as the photo page shows it.
type Choice = { value: string; label: string; ref?: string }
type Formats = { money(cents: number, currency: string): string }

function productLabel({ productId, grantedCredits }: PaymentOption, products: readonly SiteProduct[], t: Translate): string {
  const product = products.find((p) => p.id === productId)
  if (!product) return productId
  if (product.tier === 'pack') return grantedCredits == null ? t('product.packUnknown') : t('product.pack', { credits: grantedCredits })
  return t('product.plan', { tier: t(`tiers.${product.tier}`), interval: product.interval })
}

export function paymentChoices(
  options: readonly PaymentOption[],
  products: readonly SiteProduct[],
  t: Translate,
  formats: Formats,
): Choice[] {
  return options.map((option) => ({
    value: option.id,
    label: t('product.option', {
      product: productLabel(option, products, t),
      amount: formats.money(option.amountTotal, option.currency),
      date: new Date(option.createdAt),
    }),
  }))
}

// `refs`: reference numbers read on the server (jobRefsOrShort), so the picker shows the same,
// longer number the photo page and the admin show when two jobs share the first 8 characters.
export function workChoices(options: readonly WorkOption[], t: Translate, refs: ReadonlyMap<string, string> = new Map()): Choice[] {
  return options.map((option) => {
    const ref = refs.get(option.id) ?? jobRef(option.id)
    // The reference number (T78) is how the user and the Owner tell two works apart.
    return { value: option.id, ref, label: t('new.workOption', { template: option.templateName, date: new Date(option.createdAt), ref }) }
  })
}

// Stripe-style smallest units: two decimals except zero-decimal currencies, which the payments
// table never holds in v1 (prices are in USD), so cents / 100 is enough here. "$24.90" in both
// languages, never "US$24.90" (建站规格 G3).
export function formatMoney(locale: string) {
  return (cents: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'narrowSymbol' }).format(cents / 100)
}
