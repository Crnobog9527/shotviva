import { expect, it } from 'vitest'
import { TEST_PRODUCTS } from './stripe/test-products'
import { listedProducts, readProductCatalog } from './product-catalog'

const baseline = TEST_PRODUCTS.map(p => ({
  product_id: p.id, revision: 2, tier: p.tier, kind: p.interval === 'year' ? 'yearly' : p.interval === 'month' ? 'monthly' : 'pack',
  usd_cents: Math.round(p.priceUsd * 100), credits: p.credits, paid_days: p.paidDays, listed: true, name_en: p.id, name_zh: p.id,
}))
const read = (data: unknown[], rates: unknown[] = []) =>
  readProductCatalog({ rpc: async (fn: string) => ({ data: fn === 'read_catalog_member_rates' ? rates : data, error: null }) }, 'v2')

// Migration 1610: each M / L revision carries its own member rate; before it, none (revision-2 rate).
it('attaches each pack revision\'s member rate, and none when the database predates it', async () => {
  const packM = baseline.find(p => p.product_id === 'pack_m')!
  const rows = [packM, { ...packM, product_id: 'pack_l', revision: 3 }]
  const rates = [{ product_id: 'pack_m', revision: 2, starter_pct: 95, pro_pct: 90, max_pct: 85 },
    { product_id: 'pack_l', revision: 3, starter_pct: 100, pro_pct: 95, max_pct: 90 }, { product_id: 'pack_l', revision: 2, starter_pct: 95, pro_pct: 90, max_pct: 85 }]
  expect(listedProducts(await read(rows, rates)).map(p => p.packMemberPayPct)).toEqual([
    { starter: 95, pro: 90, max: 85 }, { starter: 100, pro: 95, max: 90 }])
  const before = { rpc: async (fn: string) => fn === 'read_catalog_member_rates'
    ? { data: null, error: { message: 'missing', code: 'PGRST202' } } : { data: rows, error: null } }
  expect(listedProducts(await readProductCatalog(before, 'v2')).map(p => p.packMemberPayPct)).toEqual([undefined, undefined])
  const broken = { rpc: async (fn: string) => fn === 'read_catalog_member_rates'
    ? { data: null, error: { message: 'timeout', code: '57014' } } : { data: rows, error: null } }
  await expect(readProductCatalog(broken, 'v2')).rejects.toThrow()
})

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
