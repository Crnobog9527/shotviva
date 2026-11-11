import { limitsFor } from '@/core/billing/tier-limits'
import type { MembershipTier } from '@/core/config'
import { MAX_BATCH_TEMPLATES } from '@/core/jobs/batch/limits'

// The tier-gated ways to create that the Create page lists (Owner 2026-11-12): batch photos
// (Pro 10, Max 30) and several templates at once (Max only). The ZIP download is part of the
// batch (it only exists for a batch), so it is a step of that intro, not a card of its own.
export const GATED_FEATURES = ['batch', 'templates'] as const
export type GatedFeature = (typeof GATED_FEATURES)[number]

export type PaidTier = Exclude<MembershipTier, 'starter'>

// The lowest tier that unlocks each feature: its badge, and the plan the paywall opens on.
export const FEATURE_TIER: Record<GatedFeature, PaidTier> = { batch: 'pro', templates: 'max' }

// What pressing a feature does for this account:
// - `locked`: the intro first, then the paywall on `needs`;
// - `open`: straight into the feature;
// - `guide`: the feature has no page of its own at this tier (a Pro batch is picked inside any
//   template), so the intro shows how, and offers the bigger tier as a quiet second step.
export type FeatureAccess = { kind: 'locked'; needs: PaidTier } | { kind: 'open'; href: string } | { kind: 'guide'; more: PaidTier | null }

// The multi-template workspace takes one template too, so on Max both features open it.
export const BATCH_WORKSPACE = '/generate/batch'

export function featureAccess(feature: GatedFeature, tier: MembershipTier | null): FeatureAccess {
  if (tier === 'max') return { kind: 'open', href: BATCH_WORKSPACE }
  if (feature === 'batch' && tier === 'pro') return { kind: 'guide', more: 'max' }
  return { kind: 'locked', needs: FEATURE_TIER[feature] }
}

// The numbers the cards and intros print, from the one tier table (ARCHITECTURE §6.2).
export const batchCounts = () => ({ pro: limitsFor('pro').batchMax, max: limitsFor('max').batchMax })

// Templates one multi-template batch may hold (Max).
export const MATRIX_TEMPLATES = MAX_BATCH_TEMPLATES
