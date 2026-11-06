import type { MembershipTier } from '../config'

// Generations in flight at once per membership tier (ARCHITECTURE §6.2). No tier (never paid,
// expired, packs only) counts as 1. No server-only import: the paywall lists these numbers.
export const TIER_CONCURRENCY: Record<MembershipTier, number> = { starter: 1, pro: 3, max: 6 }
export const NO_TIER_CONCURRENCY = 1

export function concurrencyFor(tier: MembershipTier | null): number {
  return tier ? TIER_CONCURRENCY[tier] : NO_TIER_CONCURRENCY
}

// Support reply times (ARCHITECTURE §6.2 "会员档位权益"), in hours; null is "the same business
// day". Without a tier the base time applies. The paywall perks and the support pages read
// these, so the promise is written in one place.
export const TIER_SUPPORT_REPLY_HOURS = { starter: 48, pro: 24, max: null } as const satisfies Record<MembershipTier, number | null>
export const BASE_SUPPORT_REPLY_HOURS = 48
