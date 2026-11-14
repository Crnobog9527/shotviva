import type { SiteProduct } from '../../config'

// Fixture for core tests (core cannot import site): the nine products of ARCHITECTURE §6.2.
// The real catalog in site.config is checked against the products table in tests/db.
export const TEST_PRODUCTS: readonly SiteProduct[] = [
  { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 50, paidDays: 30, priceUsd: 19.9 },
  { id: 'starter_yearly', tier: 'starter', interval: 'year', credits: 600, paidDays: 365, priceUsd: 191 },
  { id: 'pro_monthly', tier: 'pro', interval: 'month', credits: 135, paidDays: 30, priceUsd: 49.9 },
  { id: 'pro_yearly', tier: 'pro', interval: 'year', credits: 1620, paidDays: 365, priceUsd: 479 },
  { id: 'max_monthly', tier: 'max', interval: 'month', credits: 280, paidDays: 30, priceUsd: 99 },
  { id: 'max_yearly', tier: 'max', interval: 'year', credits: 3360, paidDays: 365, priceUsd: 713 },
  { id: 'pack_s', tier: 'pack', interval: null, credits: 20, paidDays: null, priceUsd: 9.9 },
  { id: 'pack_m', tier: 'pack', interval: null, credits: 55, paidDays: null, priceUsd: 24.9 },
  { id: 'pack_l', tier: 'pack', interval: null, credits: 115, paidDays: null, priceUsd: 49.9 },
]

export function testProduct(id: string): SiteProduct {
  const found = TEST_PRODUCTS.find((p) => p.id === id)
  if (!found) throw new Error(`no test product ${id}`)
  return found
}
