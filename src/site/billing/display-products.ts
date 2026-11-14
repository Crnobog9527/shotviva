import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { publishedOffers, historicalProducts, waffoOffers } from '@/core/billing/product-catalog'
import { FAILED_READ_LIFE } from '@/core/cache-life'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'
import type { SiteProduct } from '@/core/config'
import { publicEnv } from '@/core/public-env'
import { site } from '../site.config'

// Financial validations always read the current database rows without the display fallback.
export async function currentProducts(db = createAdminSupabase()) {
  return publishedOffers(db, site.billing.pricingVersion)
}

export function contractProducts(db = createAdminSupabase()) {
  return historicalProducts(db, site.billing.pricingVersion)
}

// The last catalog this server instance read successfully. A failed read serves it (or, on a
// cold instance, an empty list) for FAILED_READ_LIFE only, so a database blip never caches
// "coming soon" and empty JSON-LD offers for hours; checkout always re-reads (currentProducts).
let lastGood: readonly SiteProduct[] | undefined
const RETRY_DELAYS_MS = [200, 800]

async function readDisplayCatalog() {
  const env = serverEnv()
  return env.PAYMENT_CHANNEL === 'waffo'
    ? waffoOffers(createAdminSupabase(), site.billing.pricingVersion, env.WAFFO_STORE_ID ?? '', env.WAFFO_ENVIRONMENT)
    : currentProducts()
}

async function readWithRetry(): Promise<readonly SiteProduct[]> {
  for (const delay of RETRY_DELAYS_MS) {
    try { return await readDisplayCatalog() } catch { await new Promise(resolve => setTimeout(resolve, delay)) }
  }
  return readDisplayCatalog()
}

export async function displayProducts(): Promise<readonly SiteProduct[]> {
  'use cache'
  cacheTag('billing-products')
  // The repository builds and audits static HTML without a configured database in CI.
  // Only that local/offline environment may use the fixed phase-one baseline.
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY && publicEnv.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321') {
    cacheLife(FAILED_READ_LIFE)
    return site.billing.products
  }
  try {
    const products = await readWithRetry()
    lastGood = products
    cacheLife('hours')
    return products
  } catch (error) {
    logger.warn('billing.display_catalog_unavailable', { error, fallback: lastGood ? 'last_good' : 'empty' })
    cacheLife(FAILED_READ_LIFE)
    return lastGood ?? []
  }
}
