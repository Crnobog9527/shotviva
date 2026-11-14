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
