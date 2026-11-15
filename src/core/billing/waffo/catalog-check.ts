import { z } from 'zod'

import type { SiteProduct } from '../../config'
import { quoteCheckout } from '../checkout-price'
import { toCents } from './payment-facts'

type Maps = { productIds: Partial<Record<string, string>>; subscriptionProductIds: Partial<Record<string, string>> }
const product = z.object({
  id: z.string(), status: z.string(),
  prices: z.array(z.object({ currency: z.string(), priceInfo: z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/) }) })),
})
const catalog = z.object({ onetimeProducts: z.array(product), subscriptionProducts: z.array(product) })
type Entry = z.infer<typeof product>

export const productQuery = `query Catalog($store: String!, $one: [String!]!, $rec: [String!]!) {
  onetimeProducts(storeId: $store, filter: {id: {in: $one}}, limit: 50) { id status prices { currency priceInfo { amount } } }
  subscriptionProducts(storeId: $store, filter: {id: {in: $rec}}, limit: 50) { id status prices { currency priceInfo { amount } } }
}`

function compare(sku: string, form: string, id: string | undefined, expected: number, entries: Entry[]) {
  if (!id) return { sku, form, suffix: '----', expected, actual: null, ok: false }
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
    const recurringId = maps.subscriptionProductIds[product.id]
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

export const bindingRows = z.array(z.object({ product_id: z.string(), revision: z.int(), one_time_id: z.string(),
  recurring_id: z.string().nullable(), usd_cents: z.int() }))

// The Waffo products checkout sells each version with (catalog_channel_price): its binding for this
// store and mode, else nothing. The environment mapping stands in only for an unbound seeded
// version, which the admin seeded review would bind. Unmapped versions are hidden on Waffo.
export function checkedMaps(products: readonly SiteProduct[], env: Maps, bindings: z.infer<typeof bindingRows>) {
  const maps: Maps = { productIds: {}, subscriptionProductIds: {} }
  const unmapped: string[] = []
  for (const product of products) {
    const bound = bindings.find(b => b.product_id === product.id && b.revision === product.revision)
    const seeded = product.revision === undefined || product.revision === 1 || product.revision === 2
    const once = bound ? bound.one_time_id : seeded ? env.productIds[product.id] : undefined
    if (!once) { unmapped.push(product.id); continue }
    maps.productIds[product.id] = once
    maps.subscriptionProductIds[product.id] = bound ? bound.recurring_id ?? undefined : env.subscriptionProductIds[product.id]
  }
  return { maps, unmapped, mapped: products.filter(p => !unmapped.includes(p.id)) }
}
