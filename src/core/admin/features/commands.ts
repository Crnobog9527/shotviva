import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import { AppError } from '@/core/errors'
import { FEATURE_MIN_TIERS, FEATURES, findFeature, loadFeatureAccess, type FeatureDefinition } from '@/core/features'
import { logger } from '@/core/logger'

import { FEATURES_COPY } from '../features-editor/copy'
import { listFeatureInvites } from './invites'
import type { FeatureSetting } from './types'

// /admin/features data (ARCHITECTURE §6.2). Service-role client only: feature_access refuses
// every client role. Keys come from the code registry; anything else is refused before the
// database is touched.


// Registry order, each feature with its stored gate (none = everyone). The admin page reads
// the table directly, not the cache, so it always shows what was last saved.
export async function listFeatureSettings(
  db: SupabaseClient,
  registry: readonly FeatureDefinition[] = FEATURES,
): Promise<FeatureSetting[]> {
  if (registry.length === 0) return []
  const rows = await loadFeatureAccess(db)
  return Promise.all(registry.map(async ({ key, name, inviteOnly = false }) => {
    const row = rows.find((r) => r.key === key)
    const invites = inviteOnly ? await listFeatureInvites(db, key) : []
    return { key, name, minTier: row?.minTier ?? null, openToAllAt: row?.openToAllAt ?? null, inviteOnly, invites }
  }))
}

export const saveFeatureAccessSchema = z.object({
  key: z.string().min(1).max(40),
  minTier: z.enum(FEATURE_MIN_TIERS).nullable(),
  openToAllAt: z.iso.datetime({ offset: true }).nullable(),
})

export type FeatureAccessDeps = {
  db: RpcClient
  // Expires the features cache tag; the server action passes updateTag + refresh.
  invalidate: () => void
  registry?: readonly FeatureDefinition[]
}

export async function saveFeatureAccess(deps: FeatureAccessDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = saveFeatureAccessSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', FEATURES_COPY.errors.invalid)
  const { key, minTier } = parsed.data
  if (!findFeature(deps.registry ?? FEATURES, key)) throw new AppError('INVALID_INPUT', FEATURES_COPY.errors.unknownFeature)
  // An opening date only means something while there is a gate to open.
  const openToAllAt = minTier ? parsed.data.openToAllAt : null
  await callRpc(
    deps.db,
    'admin_set_feature_access',
    { p_key: key, p_min_tier: minTier, p_open_to_all_at: openToAllAt, p_actor: adminId },
    z.unknown(),
  )
  deps.invalidate()
  logger.info('admin.feature_access.saved', { adminId, key, minTier, openToAllAt })
}
