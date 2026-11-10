import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { listedProducts, readProductCatalog } from '@/core/billing/product-catalog'
import { FAILED_READ_LIFE } from '@/core/cache-life'
import { AppError } from '@/core/errors'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'
import { publicEnv } from '@/core/public-env'
import { site } from '../site.config'

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
    const rows = await readProductCatalog(createAdminSupabase(), site.billing.pricingVersion)
    cacheLife('hours')
    return listedProducts(rows)
  } catch (error) {
    logger.warn('billing.display_catalog_unavailable', { error })
    cacheLife(FAILED_READ_LIFE)
    // Vercel can prerender before the migration runs. Preserve the nine approved
    // offers only for a missing RPC; invalid catalog data never becomes a sale.
    if (error instanceof AppError && error.cause && typeof error.cause === 'object'
      && 'code' in error.cause && error.cause.code === 'PGRST202') return site.billing.products
    return []
  }
}
