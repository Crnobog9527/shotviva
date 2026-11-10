import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { publishedOffers, historicalProducts, waffoOffers } from '@/core/billing/product-catalog'
import { FAILED_READ_LIFE } from '@/core/cache-life'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'
import { publicEnv } from '@/core/public-env'
import { site } from '../site.config'

// Financial validations always read the current database rows without the display fallback.
export async function currentProducts(db = createAdminSupabase()) {
  return publishedOffers(db, site.billing.pricingVersion)
}

export function contractProducts(db = createAdminSupabase()) {
  return historicalProducts(db, site.billing.pricingVersion)
}

export async function displayProducts() {
  'use cache'
  cacheTag('billing-products')
  // The repository builds and audits static HTML without a configured database in CI.
  // Only that local/offline environment may use the fixed phase-one baseline.
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY && publicEnv.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321') {
    cacheLife(FAILED_READ_LIFE)
    return site.billing.products
  }
  try {
    const env = serverEnv()
    const products = env.PAYMENT_CHANNEL === 'waffo'
      ? await waffoOffers(createAdminSupabase(), site.billing.pricingVersion, env.WAFFO_STORE_ID ?? '', env.WAFFO_ENVIRONMENT)
      : await currentProducts()
    cacheLife('hours')
    return products
  } catch (error) {
    logger.warn('billing.display_catalog_unavailable', { error })
    cacheLife(FAILED_READ_LIFE)
    return []
  }
}
