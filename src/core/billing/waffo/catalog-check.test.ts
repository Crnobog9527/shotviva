import { expect, it } from 'vitest'

import { waffoProductIdsSchema, waffoSubscriptionIdsSchema } from '../../waffo-env'
import { TEST_PRODUCTS } from '../stripe/test-products'
import { catalogCheckMode, catalogReport, compareCatalog } from './catalog-check'

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

it('runs the build check only for test-mode Waffo, and an operator check in either mode', () => {
  const env = (PAYMENT_CHANNEL: string, WAFFO_ENVIRONMENT: string) => ({ PAYMENT_CHANNEL, WAFFO_ENVIRONMENT })
  expect(catalogCheckMode(['--build'], env('waffo', 'test'))).toBe('check')
  expect(catalogCheckMode(['--build'], env('waffo', 'prod'))).toBe('skip')
  expect(catalogCheckMode(['--build'], env('stripe', 'test'))).toBe('skip')
  expect(catalogCheckMode([], env('stripe', 'prod'))).toBe('check')
  expect(catalogCheckMode(['--prod'], env('stripe', 'prod'))).toBe('check')
  expect(() => catalogCheckMode(['--prod'], env('stripe', 'test'))).toThrow('--prod')
})

it('reports by product and last four id characters, with the Waffo channel state when known', () => {
  const rows = [{ sku: 'pack_s', form: 'once', suffix: '1234', expected: 1123, actual: 1123, ok: true },
    { sku: 'max_yearly', form: 'recurring', suffix: '9876', expected: 4567, actual: null, ok: false }]
  expect(catalogReport(rows, new Set(['pack_s']))).toEqual([
    'pack_s once …1234 USD cents: Waffo=1123 quote=1123 OK waffo-channel=shown',
    'max_yearly recurring …9876 USD cents: Waffo=missing quote=4567 CHECK waffo-channel=hidden',
  ])
  expect(catalogReport(rows)[0]).toBe('pack_s once …1234 USD cents: Waffo=1123 quote=1123 OK')
})
