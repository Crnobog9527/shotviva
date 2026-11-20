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

// Cache policy rows. The request still checks its own clock, invite and membership.
function loadTaggedFeatureAccess() {
  cacheTag(FEATURES_CACHE_TAG)
  cacheLife({ revalidate: 300, expire: 3600 })
  return loadFeatureAccess(createAdminSupabase())
}

export async function cachedFeatureAccess(): Promise<FeatureAccess[]> {
  'use cache'
  return loadTaggedFeatureAccess()
}

export async function sharedCreateFeatureAccess(): Promise<FeatureAccess[]> {
  'use cache: remote'
  return loadTaggedFeatureAccess()
}

export async function featureAccessFor(key: string, load: () => Promise<FeatureAccess[]> = cachedFeatureAccess) {
  return (await load()).find((row) => row.key === key) ?? null
}
