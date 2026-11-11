import 'server-only'

import type { MembershipTier } from '../config'
import { createAdminSupabase } from '../auth/supabase-admin'
import { effectiveTier } from '../billing/tier'
import { AppError, TierRequiredError } from '../errors'
import { missingTier, type FeatureAccess } from './access'
import { cachedFeatureAccess } from './read'
import { FEATURES, findFeature, type FeatureDefinition } from './registry'

export type RequireFeatureDeps = {
  registry: readonly FeatureDefinition[]
  loadAccess: () => Promise<FeatureAccess[]>
  tierOf: (userId: string) => Promise<MembershipTier | null>
  now: () => number
}

const defaults = (): RequireFeatureDeps => ({
  registry: FEATURES,
  loadAccess: cachedFeatureAccess,
  // An unbanned admin counts as Max (effective_tier), so gated features are open to the Owner.
  tierOf: (userId) => effectiveTier(createAdminSupabase(), userId),
  now: Date.now,
})

// Server gate for a tier-limited feature (ARCHITECTURE §6.2). Throws TIER_REQUIRED (403 with
// required_tier) when the user's tier is too low. The tier is only looked up when the feature
// is actually gated right now, so an open feature costs no extra database call.
export async function requireFeature(userId: string, key: string, deps: Partial<RequireFeatureDeps> = {}): Promise<void> {
  const { registry, loadAccess, tierOf, now } = { ...defaults(), ...deps }
  // A typo here would silently leave the feature open to everyone.
  if (!findFeature(registry, key)) throw new AppError('INTERNAL', `feature ${key} is not registered`)
  const access = (await loadAccess()).find((row) => row.key === key)
  const at = now()
  // Open even to an account with no tier: open to everyone.
  if (missingTier(null, access, at) === null) return
  const missing = missingTier(await tierOf(userId), access, at)
  if (missing) throw new TierRequiredError(missing, `feature ${key} needs ${missing}`)
}
