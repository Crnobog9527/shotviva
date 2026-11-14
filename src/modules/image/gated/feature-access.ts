import { limitsFor } from '@/core/billing/tier-limits'
import type { MembershipTier } from '@/core/config'
import { MAX_BATCH_TEMPLATES } from '@/core/jobs/batch/limits'

// The tier-gated parts of Batch create (Owner 2026-11-12): one form where one template on many
// photos is a batch and two to five templates make a grid. Batch photos come with Pro (10) and
// Max (30); several templates come with Max only. The ZIP download is part of every batch, so it
// is a step of the batch demo, not a feature of its own.
export const GATED_FEATURES = ['batch', 'templates'] as const
export type GatedFeature = (typeof GATED_FEATURES)[number]

export type PaidTier = Exclude<MembershipTier, 'starter'>

// The lowest tier that unlocks each part: its badge, and the plan the paywall opens on.
export const FEATURE_TIER: Record<GatedFeature, PaidTier> = { batch: 'pro', templates: 'max' }

// What one batch may hold on this plan, the same rule the server enforces (assertBatchAllowed):
// up to `cells` photos in all (limitsFor().batchMax), and more than one template on Max only.
// Null below Pro, where a batch is one photo and the page shows the plan that unlocks it.
export type BatchCaps = { templates: number; cells: number }

export function batchCaps(tier: MembershipTier | null): BatchCaps | null {
  const cells = limitsFor(tier).batchMax
  if (cells <= 1) return null
  return { templates: tier === 'max' ? MAX_BATCH_TEMPLATES : 1, cells }
}

export function isLocked(feature: GatedFeature, tier: MembershipTier | null): boolean {
  const caps = batchCaps(tier)
  return feature === 'batch' ? caps === null : (caps?.templates ?? 1) <= 1
}

// The numbers the card, the demos and the steps print, from the one tier table (ARCHITECTURE §6.2).
export const batchCounts = () => ({ pro: limitsFor('pro').batchMax, max: limitsFor('max').batchMax })

// Templates one multi-template batch may hold (Max).
export const MATRIX_TEMPLATES = MAX_BATCH_TEMPLATES
