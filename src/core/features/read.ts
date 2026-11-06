import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { AppError } from '../errors'
import { featureAccessRowSchema, type FeatureAccess } from './access'

// /admin/features expires this tag on every save (updateTag), so a gate changes without a deploy.
export const FEATURES_CACHE_TAG = 'features'

type Db = ReturnType<typeof createAdminSupabase>

// The whole table: one row per gated feature, a handful at most, read by primary key order.
export async function loadFeatureAccess(db: Db): Promise<FeatureAccess[]> {
  const { data, error } = await db.from('feature_access').select('key, min_tier, open_to_all_at').order('key')
  if (error) throw new AppError('INTERNAL', 'feature_access read failed', { cause: new Error(error.message) })
  return featureAccessRowSchema.array().parse(data)
}

// Rows only, never a decision: open_to_all_at is compared with the request's own clock, so
// a cached entry cannot keep a feature locked past its opening time. The short lifetime
// bounds how long an instance that missed the tag expiry keeps an old gate.
export async function cachedFeatureAccess(): Promise<FeatureAccess[]> {
  'use cache'
  cacheTag(FEATURES_CACHE_TAG)
  cacheLife({ revalidate: 300, expire: 3600 })
  return loadFeatureAccess(createAdminSupabase())
}

export async function featureAccessFor(key: string, load: () => Promise<FeatureAccess[]> = cachedFeatureAccess) {
  return (await load()).find((row) => row.key === key) ?? null
}
