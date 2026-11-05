import type { MembershipTier } from '../config'

// Generations in flight at once per membership tier (ARCHITECTURE §6.2). No tier (never paid,
// expired, packs only) counts as 1. No server-only import: the paywall lists these numbers.
export const TIER_CONCURRENCY: Record<MembershipTier, number> = { starter: 1, pro: 3, max: 6 }
export const NO_TIER_CONCURRENCY = 1

export function concurrencyFor(tier: MembershipTier | null): number {
  return tier ? TIER_CONCURRENCY[tier] : NO_TIER_CONCURRENCY
}
