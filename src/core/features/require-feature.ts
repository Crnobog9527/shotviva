import 'server-only'

import type { MembershipTier } from '../config'
import { createAdminSupabase } from '../auth/supabase-admin'
import { effectiveTier } from '../billing/tier'
import { AppError, TierRequiredError } from '../errors'
import { missingTier, type FeatureAccess } from './access'
import { isInvited } from './invited'
import { cachedFeatureAccess } from './read'
import { FEATURES, findFeature, type FeatureDefinition } from './registry'

export type RequireFeatureDeps = {
  registry: readonly FeatureDefinition[]
  loadAccess: () => Promise<FeatureAccess[]>
  tierOf: (userId: string) => Promise<MembershipTier | null>
  invited: (userId: string, key: string) => Promise<boolean>
  now: () => number
}

const defaults = (): RequireFeatureDeps => ({
  registry: FEATURES,
  loadAccess: cachedFeatureAccess,
  // An unbanned admin counts as Max (effective_tier), so gated features are open to the Owner.
  tierOf: (userId) => effectiveTier(createAdminSupabase(), userId),
  invited: (userId, key) => isInvited(createAdminSupabase(), userId, key),
  now: Date.now,
})

// Server gate for a gated feature (ARCHITECTURE §6.2). Throws TIER_REQUIRED (403 with
// required_tier) when the user's tier is too low, FORBIDDEN when an invite-only feature has not
// invited them. The tier is only looked up when the feature is actually gated right now, so an
// open feature costs no extra database call.
export async function requireFeature(userId: string, key: string, deps: Partial<RequireFeatureDeps> = {}): Promise<void> {
  if (!(await featureAllowed(userId, key, deps))) throw new AppError('FORBIDDEN', `feature ${key} is invite-only`)
}

// The same rule as a yes / no for pages that only show or hide an entry. A tier gate the user is
// below still throws TIER_REQUIRED so callers can offer the upgrade.
export async function featureAllowed(userId: string, key: string, deps: Partial<RequireFeatureDeps> = {}): Promise<boolean> {
  const { registry, loadAccess, tierOf, invited, now } = { ...defaults(), ...deps }
  const feature = findFeature(registry, key)
  // A typo here would silently leave the feature open to everyone.
  if (!feature) throw new AppError('INTERNAL', `feature ${key} is not registered`)
  const access = (await loadAccess()).find((row) => row.key === key)
  const at = now()
  if (feature.inviteOnly) return openToAll(access, at) || invited(userId, key)
  // Open even to an account with no tier: open to everyone.
  if (missingTier(null, access, at) === null) return true
  const missing = missingTier(await tierOf(userId), access, at)
  if (missing) throw new TierRequiredError(missing, `feature ${key} needs ${missing}`)
  return true
}

const openToAll = (access: FeatureAccess | undefined, at: number) =>
  access?.openToAllAt != null && Date.parse(access.openToAllAt) <= at
