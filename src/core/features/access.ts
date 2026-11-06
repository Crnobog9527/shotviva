import { z } from 'zod'

import type { MembershipTier } from '../config'
import type { RequiredTier } from '../errors'

// The rule for one feature_access row (ARCHITECTURE §6.2). Pure, so the admin page, server
// gates and tests share it. No server-only import: a page may lock a button with it.

export const FEATURE_MIN_TIERS = ['pro', 'max'] as const satisfies readonly RequiredTier[]

export type FeatureAccess = { key: string; minTier: RequiredTier | null; openToAllAt: string | null }

export const featureAccessRowSchema = z
  .object({ key: z.string(), min_tier: z.enum(FEATURE_MIN_TIERS).nullable(), open_to_all_at: z.string().nullable() })
  .transform((row): FeatureAccess => ({ key: row.key, minTier: row.min_tier, openToAllAt: row.open_to_all_at }))

const RANK: Record<MembershipTier, number> = { starter: 0, pro: 1, max: 2 }

// The tier still missing, or null when the user may use the feature. No row, a null min_tier
// or a passed open_to_all_at opens it to everyone; no tier counts as Starter.
export function missingTier(
  tier: MembershipTier | null,
  access: FeatureAccess | null | undefined,
  now: Date | number,
): RequiredTier | null {
  if (!access?.minTier) return null
  if (access.openToAllAt !== null && Date.parse(access.openToAllAt) <= new Date(now).getTime()) return null
  return RANK[tier ?? 'starter'] >= RANK[access.minTier] ? null : access.minTier
}

export function featureOpen(tier: MembershipTier | null, access: FeatureAccess | null | undefined, now: Date | number): boolean {
  return missingTier(tier, access, now) === null
}
