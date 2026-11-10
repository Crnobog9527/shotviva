import { MEMBERSHIP_TIERS, type MembershipTier } from '../config'

// Every number that changes with the membership tier, in one table (ARCHITECTURE §6.2 "档位限制只有
// 一张表"): the paywall perks and the server checks both read it, so the page says what the code
// enforces. No tier (never paid, expired, packs only) is Starter. No server-only import: the
// paywall and the workspace list these numbers in the browser.
export type TierLimits = {
  // Generations in flight at once.
  concurrency: number
  // Generations started per 10-minute window (core/jobs/rate-limit.ts).
  perWindow: number
  // Photos one batch may hold (the workspace picker; /api/generate checks batch_size against it).
  batchMax: number
  // Support reply time in hours (in-site tickets and email), kept by the Owner in person.
  supportHours: number
  // What one wishlist vote adds to a request's count: the snapshot toggle_template_request_vote
  // takes (ARCHITECTURE §15.3, Max 3, others 1). Shown on the paywall; SQL is the enforcer.
  voteWeight: number
}

export const TIER_LIMITS = {
  starter: { concurrency: 1, perWindow: 20, batchMax: 1, supportHours: 48, voteWeight: 1 },
  pro: { concurrency: 3, perWindow: 40, batchMax: 10, supportHours: 48, voteWeight: 1 },
  max: { concurrency: 6, perWindow: 80, batchMax: 30, supportHours: 24, voteWeight: 3 },
} as const satisfies Record<MembershipTier, TierLimits>

export const limitsFor = (tier: MembershipTier | null): TierLimits => TIER_LIMITS[tier ?? 'starter']

// The largest batch any tier allows: the request schema's upper bound.
export const MAX_BATCH_SIZE = Math.max(...MEMBERSHIP_TIERS.map((tier) => TIER_LIMITS[tier].batchMax))

// The lowest tier whose batch holds `size` photos, for TIER_REQUIRED and the paywall preselect;
// null when no tier does.
export function tierForBatch(size: number): MembershipTier | null {
  return MEMBERSHIP_TIERS.find((tier) => TIER_LIMITS[tier].batchMax >= size) ?? null
}

// The next tier up that holds a bigger batch than `tier` does (Starter → Pro, Pro → Max).
export function batchUpgrade(tier: MembershipTier | null): MembershipTier | null {
  const current = limitsFor(tier).batchMax
  return MEMBERSHIP_TIERS.find((next) => TIER_LIMITS[next].batchMax > current) ?? null
}

// The reply time the support pages promise everyone (no tier = Starter, 48 hours); Max is
// faster (TIER_LIMITS.max.supportHours).
export const BASE_SUPPORT_REPLY_HOURS = TIER_LIMITS.starter.supportHours
