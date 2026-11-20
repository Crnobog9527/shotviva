import { MEMBERSHIP_TIERS, type MembershipTier, type SiteProduct } from '../../config'
import { percentZh } from '../../codes/discount'
import { hasMemberRate, packMemberPercentOff } from '../pack-price'
import { BASE_SUPPORT_REPLY_HOURS, TIER_LIMITS } from '../tier-limits'

// Only shipped tier benefits are shown (DESIGN "The Live Perks Rule"). Every number comes from
// the table the server enforces (tier-limits.ts) or the pack member rate (pack-price.ts).
export type Perk = { key: string; values?: Record<string, number> }
export type TierPerks = { heading: 'includes'; live: Perk[]; soon: Perk[] }
export type MemberPackOff = Readonly<Record<MembershipTier, number>>
// wishlistLive: the admin switch (ARCHITECTURE §15.6). memberPacks: the M / L pack member
// discount per tier while it is live (pricing catalogue v2, the same flag the pack note and the
// checkout quote read); absent or null when it is not.
export type PerkOptions = { wishlistLive: boolean; memberPacks?: MemberPackOff | null }

// The member discount the listed M and L packs give, per tier. Each pack revision has its own
// rate (migration 1610); while only one of them is republished, promise the smaller discount.
export function memberPackOff(products: readonly SiteProduct[]): MemberPackOff | null {
  const packs = products.filter(hasMemberRate)
  if (packs.length === 0) return null
  return Object.fromEntries(MEMBERSHIP_TIERS.map(tier =>
    [tier, Math.min(...packs.map(pack => packMemberPercentOff(pack, tier)))])) as Record<MembershipTier, number>
}

// One order on every card and in the comparison table (Owner 2026-11-10): speed and batch, the
// member pack price, support, the wishlist vote, then what every plan shares.
// The pack note's values: each tier's discount, and its Chinese name (「95 折」, 0 → 「原价」).
export function packNoteValues(off: MemberPackOff) {
  const zh = (pct: number) => (pct > 0 ? ` ${percentZh(pct)}` : '原价')
  return { ...off, starterZh: zh(off.starter), proZh: zh(off.pro), maxZh: zh(off.max) }
}

export function tierPerks(tier: MembershipTier, options: PerkOptions): TierPerks {
  const limits = TIER_LIMITS[tier]
  const live: Perk[] = [
    { key: 'concurrency', values: { count: limits.concurrency } },
    { key: 'batch', values: { count: limits.batchMax } },
  ]
  // A tier that pays full price for packs (Starter since 2026-11-21) has nothing to list.
  const packOff = options.memberPacks?.[tier] ?? 0
  if (packOff > 0) live.push({ key: 'memberPacks', values: { pct: packOff } })
  // Max answers faster than everyone else (48 / 48 / 24 hours).
  live.push({ key: limits.supportHours < BASE_SUPPORT_REPLY_HOURS ? 'supportPriority' : 'support', values: { hours: limits.supportHours } })
  // The weighted vote ships with the wishlist (T12); listed only while it is open, and only on
  // a tier whose vote counts for more than one.
  if (options.wishlistLive && limits.voteWeight > 1) live.push({ key: 'wishlistVotes', values: { weight: limits.voteWeight } })
  live.push({ key: 'basics' })
  return { heading: 'includes', live, soon: [] }
}
