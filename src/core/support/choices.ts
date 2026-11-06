import type { SiteProduct } from '../config'
import type { Translate } from '../translate'
import type { PaymentOption, WorkOption } from './types'

// The submit form's pickers, worded on the server (app.support.product / app.support.new) so
// the client gets plain labels. Money in the payment's own currency, as charged.

type Choice = { value: string; label: string }
type Formats = { money(cents: number, currency: string): string }

function productLabel(productId: string, products: readonly SiteProduct[], t: Translate): string {
  const product = products.find((p) => p.id === productId)
  if (!product) return productId
  if (product.tier === 'pack') return t('product.pack', { credits: product.credits })
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
      product: productLabel(option.productId, products, t),
      amount: formats.money(option.amountTotal, option.currency),
      date: new Date(option.createdAt),
    }),
  }))
}

export function workChoices(options: readonly WorkOption[], t: Translate): Choice[] {
  return options.map((option) => ({
    value: option.id,
    label: t('new.workOption', { template: option.templateName, date: new Date(option.createdAt) }),
  }))
}

// Stripe-style smallest units: two decimals except zero-decimal currencies, which the payments
// table never holds in v1 (prices are in USD), so cents / 100 is enough here.
export function formatMoney(locale: string) {
  return (cents: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}
