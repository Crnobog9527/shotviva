import { z } from 'zod'

import type { SiteProduct } from '../../config'
import type { MembershipProductId } from '../../waffo-env'
import { quoteCheckout } from '../checkout-price'
import type { WaffoConfig } from './config'
import { toCents } from './payment-facts'

type Maps = Pick<WaffoConfig, 'productIds' | 'subscriptionProductIds'>
const product = z.object({
  id: z.string(), status: z.string(),
  prices: z.array(z.object({ currency: z.string(), priceInfo: z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/) }) })),
})
const catalog = z.object({ onetimeProducts: z.array(product), subscriptionProducts: z.array(product) })
type Entry = z.infer<typeof product>

export const productQuery = `query Catalog($store: String!, $one: [String!]!, $rec: [String!]!) {
  onetimeProducts(storeId: $store, filter: {id: {in: $one}}, limit: 9) { id status prices { currency priceInfo { amount } } }
  subscriptionProducts(storeId: $store, filter: {id: {in: $rec}}, limit: 6) { id status prices { currency priceInfo { amount } } }
}`

function compare(sku: string, form: string, id: string, expected: number, entries: Entry[]) {
  const entry = entries.find(item => item.id === id)
  const usd = entry?.prices.filter(price => price.currency.toUpperCase() === 'USD') ?? []
  const actual = usd.length === 1 ? toCents(usd[0]!.priceInfo.amount) : null
  return { sku, form, suffix: id.slice(-4), expected, actual, ok: entry?.status === 'active' && actual === expected }
}

export function compareCatalog(products: readonly SiteProduct[], maps: Maps, response: unknown) {
  const remote = catalog.parse(response)
  return products.flatMap(product => {
    const price = quoteCheckout(product, null).cents
    const once = compare(product.id, 'once', maps.productIds[product.id], price, remote.onetimeProducts)
    if (product.tier === 'pack') return [once]
    const recurringId = maps.subscriptionProductIds[product.id as MembershipProductId]
    return [once, compare(product.id, 'recurring', recurringId, price, remote.subscriptionProducts)]
  })
}

export type CatalogRow = ReturnType<typeof compareCatalog>[number]

// `pnpm pricing:waffo` (scripts/check-waffo-catalog.ts). A build checks only when it routes test
// checkouts to Waffo; an operator run reads either mode, and `--prod` refuses anything but prod
// so a pulled preview env cannot pass for the production check. Read-only in every mode.
export function catalogCheckMode(argv: readonly string[], env: { PAYMENT_CHANNEL: string; WAFFO_ENVIRONMENT: string }) {
  if (argv.includes('--build')) return env.PAYMENT_CHANNEL === 'waffo' && env.WAFFO_ENVIRONMENT === 'test' ? 'check' : 'skip'
  if (argv.includes('--prod') && env.WAFFO_ENVIRONMENT !== 'prod') throw new Error('--prod needs WAFFO_ENVIRONMENT=prod')
  return 'check'
}

// Product ids appear only as their last four characters; amounts are USD cents.
export function catalogReport(rows: readonly CatalogRow[], shown?: ReadonlySet<string>) {
  return rows.map(row => {
    const channel = shown ? ` waffo-channel=${shown.has(row.sku) ? 'shown' : 'hidden'}` : ''
    return `${row.sku} ${row.form} …${row.suffix} USD cents: Waffo=${row.actual ?? 'missing'} quote=${row.expected} ${row.ok ? 'OK' : 'CHECK'}${channel}`
  })
}
