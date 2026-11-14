import { expect, it } from 'vitest'
import { TEST_PRODUCTS } from './stripe/test-products'
import { listedProducts, readProductCatalog } from './product-catalog'

const baseline = TEST_PRODUCTS.map(p => ({
  product_id: p.id, revision: 2, tier: p.tier, kind: p.interval === 'year' ? 'yearly' : p.interval === 'month' ? 'monthly' : 'pack',
  usd_cents: Math.round(p.priceUsd * 100), credits: p.credits, paid_days: p.paidDays, listed: true, name_en: p.id, name_zh: p.id,
}))
const read = (data: unknown[]) => readProductCatalog({ rpc: async () => ({ data, error: null }) }, 'v2')

it('reads empty, partial, and expanded published catalogs without a fixed row count', async () => {
  expect(await read([])).toEqual([])
  expect(await read(baseline.slice(0, 8))).toHaveLength(8)
  const extra = { ...baseline.find(p => p.product_id === 'pack_s'), product_id: 'pack_extra' }
  const expanded = await read([...baseline, extra])
  expect(expanded).toHaveLength(10)
  expect(listedProducts(expanded)).toMatchObject([...TEST_PRODUCTS, { id: 'pack_extra', revision: 2 }])
  await expect(read([...baseline, baseline[0]])).rejects.toThrow()
})

it('accepts named membership variants and rejects a mismatched tier or cadence', async () => {
  const original = baseline.find(p => p.product_id === 'pro_yearly')
  const studio = { ...original, product_id: 'studio_yearly', revision: 3 }
  expect(listedProducts(await read([studio]))).toMatchObject([{ id: studio.product_id, tier: 'pro', interval: 'year' }])
  expect(listedProducts(await read([{ ...studio, tier: 'max' }]))[0]?.tier).toBe('max')
  await expect(read([{ ...studio, product_id: 'studio_monthly' }])).rejects.toThrow()
})
