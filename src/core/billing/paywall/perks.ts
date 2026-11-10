import type { MembershipTier } from '../../config'
import { packMemberPercentOff } from '../pack-price'
import { BASE_SUPPORT_REPLY_HOURS, TIER_LIMITS } from '../tier-limits'

// Only shipped tier benefits are shown (DESIGN "The Live Perks Rule"). Every number comes from
// the table the server enforces (tier-limits.ts) or the pack member rate (pack-price.ts).
export type Perk = { key: string; values?: Record<string, number> }
export type TierPerks = { heading: 'includes'; live: Perk[]; soon: Perk[] }
// wishlistLive: the admin switch (ARCHITECTURE §15.6). memberPacks: the M / L pack member rate
// is live (pricing catalogue v2, the same flag the pack note and the checkout quote read).
export type PerkOptions = { wishlistLive: boolean; memberPacks?: boolean }

// One order on every card and in the comparison table (Owner 2026-11-10): speed and batch, the
// member pack price, support, the wishlist vote, then what every plan shares.
export function tierPerks(tier: MembershipTier, options: PerkOptions): TierPerks {
  const limits = TIER_LIMITS[tier]
  const live: Perk[] = [
    { key: 'concurrency', values: { count: limits.concurrency } },
    { key: 'batch', values: { count: limits.batchMax } },
  ]
  if (options.memberPacks) live.push({ key: 'memberPacks', values: { pct: packMemberPercentOff(tier) } })
  // Max answers faster than everyone else (48 / 48 / 24 hours).
  live.push({ key: limits.supportHours < BASE_SUPPORT_REPLY_HOURS ? 'supportPriority' : 'support', values: { hours: limits.supportHours } })
  // The weighted vote ships with the wishlist (T12); listed only while it is open, and only on
  // a tier whose vote counts for more than one.
  if (options.wishlistLive && limits.voteWeight > 1) live.push({ key: 'wishlistVotes', values: { weight: limits.voteWeight } })
  live.push({ key: 'basics' })
  return { heading: 'includes', live, soon: [] }
}
