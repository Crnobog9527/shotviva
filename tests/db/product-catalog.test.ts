import { afterEach, expect, it, vi } from 'vitest'

import { listedProducts, readProductCatalog } from '@/core/billing/product-catalog'
import { desiredPrices } from '@/core/billing/stripe/catalog'

import { anonClient, connectAdmin, serviceClient } from './helpers'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it.each(['v1', 'v2'] as const)('preserves every %s SKU, order, grant, membership term and Stripe price variant', async version => {
  vi.stubEnv('NEXT_PUBLIC_PRICING_CATALOG_VERSION', version)
  vi.resetModules()
  const { site } = await import('@/site/site.config')
  const pricing = site.billing.pricingVersion
  const rows = await readProductCatalog(serviceClient(), pricing)
  const products = listedProducts(rows)
  expect(rows.every(r => r.revision === (version === 'v1' ? 1 : 2))).toBe(true)
  expect(products).toEqual(site.billing.products)
  expect(desiredPrices(products, pricing)).toEqual(desiredPrices(site.billing.products, pricing))
})

it('exposes neither the read RPC nor the two private tables to client roles', async () => {
  expect((await anonClient().rpc('read_product_catalog', { p_version: 'v2' })).error).toBeTruthy()
  const db = await connectAdmin()
  try {
    for (const role of ['anon', 'authenticated']) {
      const result = await db.query(`select has_function_privilege($1,'read_product_catalog(text)','execute') as rpc,
        has_table_privilege($1,'admin.catalog_products','select') as products,
        has_table_privilege($1,'admin.catalog_product_versions','select') as versions`, [role])
      expect(result.rows[0]).toEqual({ rpc: false, products: false, versions: false })
    }
  } finally { await db.end() }
})
