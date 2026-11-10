import { expect, it } from 'vitest'

import { waffoProductIdsSchema, waffoSubscriptionIdsSchema } from '../../waffo-env'
import { TEST_PRODUCTS } from '../stripe/test-products'
import { compareCatalog } from './catalog-check'

it('checks both mappings against checkout quotes, rejecting missing, inactive and mispriced products', () => {
  const products = TEST_PRODUCTS.map(p => ({ ...p, priceUsd: 11.23 }))
  const map = (prefix: string) => Object.fromEntries(products.map((p, i) => [p.id, `PROD_${prefix}${i + 10000}`]))
  const maps = { productIds: waffoProductIdsSchema.parse(map('a')), subscriptionProductIds: waffoSubscriptionIdsSchema.parse(
    Object.fromEntries(Object.entries(map('b')).filter(([id]) => !id.startsWith('pack_')))) }
  const items = (ids: string[]) => ids.map(id => ({ id, status: 'active', prices: [{ currency: 'USD', priceInfo: { amount: '11.23' } }] }))
  const remote = { onetimeProducts: items(Object.values(maps.productIds)), subscriptionProducts: items(Object.values(maps.subscriptionProductIds)) }
  expect(compareCatalog(products, maps, remote).filter(p => p.ok)).toHaveLength(15)
  remote.onetimeProducts.pop()
  remote.subscriptionProducts[0]!.prices[0]!.priceInfo.amount = '11.22'
  remote.subscriptionProducts[1]!.status = 'inactive'
  const issues = compareCatalog(products, maps, remote).filter(p => !p.ok)
  expect(issues).toHaveLength(3)
  expect(issues[0]).toMatchObject({ form: 'recurring', expected: 1123, actual: 1122, suffix: '0000' })
  expect(JSON.stringify(issues)).not.toContain('PROD_')
})
