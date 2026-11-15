import { expect, it, vi } from 'vitest'
import type { WaffoConfig } from '../../billing/waffo/config'
import { waffoProductIdsSchema, waffoSubscriptionIdsSchema } from '../../waffo-env'
import { TEST_PRODUCTS } from '../../billing/stripe/test-products'
import { bindSeededWaffo } from './waffo-seeded'

const products = TEST_PRODUCTS.map(p => ({ ...p, priceUsd: 11.23, revision: 2 }))
const map = (prefix: string) => Object.fromEntries(products.map((p, i) => [p.id, `PROD_${prefix}${i + 10000}`]))
const config = {
  storeId: 'STO_shop', mode: 'prod', productIds: waffoProductIdsSchema.parse(map('a')),
  subscriptionProductIds: waffoSubscriptionIdsSchema.parse(Object.fromEntries(Object.entries(map('b')).filter(([id]) => !id.startsWith('pack_')))),
} as unknown as WaffoConfig
const items = (ids: string[]) => ids.map(id => ({ id, status: 'active', prices: [{ currency: 'USD', priceInfo: { amount: '11.23' } }] }))
const remote = () => ({ onetimeProducts: items(Object.values(config.productIds)), subscriptionProducts: items(Object.values(config.subscriptionProductIds)) })

it('binds only seeded versions whose one-time and recurring Waffo products match the quote', async () => {
  const response = remote()
  response.subscriptionProducts[0]!.prices[0]!.priceInfo.amount = '11.22'
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) =>
    args.p_product === products[1]!.id ? { data: null, error: { message: 'CATALOG_STALE' } } : { data: null, error: null })
  const later = { ...products[2]!, revision: 3 }
  const outcomes = await bindSeededWaffo({ rpc }, 'actor', [...products.slice(0, 2), later, ...products.slice(3)], { config, read: async () => response })
  const mismatched = Object.entries(config.subscriptionProductIds).find(([, id]) => id === response.subscriptionProducts[0]!.id)![0]
  expect(outcomes.find(o => o.sku === mismatched)?.status).toBe('mismatch')
  expect(outcomes.find(o => o.sku === products[1]!.id)?.status).toBe('stale')
  expect(outcomes.some(o => o.sku === later.id)).toBe(false)
  expect(outcomes.filter(o => o.status === 'bound')).toHaveLength(products.length - 3)
  const pack = rpc.mock.calls.find(([, a]) => String(a.p_product).startsWith('pack_'))![1]
  expect(pack).toMatchObject({ p_store: 'STO_shop', p_mode: 'prod', p_revision: 2, p_recurring: null })
  expect(rpc.mock.calls.every(([fn]) => fn === 'admin_catalog_waffo_seeded')).toBe(true)
})

it('surfaces any other database error', async () => {
  const rpc = vi.fn(async () => ({ data: null, error: { message: 'NOT_ADMIN' } }))
  await expect(bindSeededWaffo({ rpc }, 'actor', products, { config, read: async () => remote() })).rejects.toThrow()
})
