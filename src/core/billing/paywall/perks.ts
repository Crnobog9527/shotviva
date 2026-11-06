import type { MembershipTier } from '../../config'
import { TIER_CONCURRENCY, TIER_SUPPORT_REPLY_HOURS } from '../tier-limits'

// Tier perks as ARCHITECTURE §6.2 "会员档位权益" lists them. Only what is live may read as a
// current feature; the rest is its own "Coming soon" group (DESIGN §4.5). Queue priority is
// never listed: v1 has no queue. Keys are message ids under paywall.perks.

export type Perk = { key: string; values?: Record<string, number> }
export type TierPerks = { heading: 'includes' | 'plusStarter' | 'plusPro'; live: Perk[]; soon: Perk[] }

export function tierPerks(tier: MembershipTier, options: { wishlistLive: boolean }): TierPerks {
  const concurrency = (t: MembershipTier): Perk => ({ key: 'concurrency', values: { count: TIER_CONCURRENCY[t] } })
  if (tier === 'starter') {
    return {
      heading: 'includes',
      live: [{ key: 'noWatermark' }, { key: 'privateAllTemplates' }, concurrency('starter'), { key: 'support48h', values: { hours: TIER_SUPPORT_REPLY_HOURS.starter } }],
      soon: [],
    }
  }
  if (tier === 'pro') {
    return {
      heading: 'plusStarter',
      // Pro answers in the same 48 hours as Starter, so it lists no support perk of its own.
      live: [concurrency('pro')],
      soon: [{ key: 'batch', values: { count: 10 } }, { key: 'brandKit' }],
    }
  }
  // The 3× wishlist vote ships with the wishlist (T12); until it is on, it is Coming soon.
  const wishlist: Perk = { key: 'wishlistVotes', values: { weight: 3 } }
  return {
    heading: 'plusPro',
    live: [concurrency('max'), { key: 'support24h', values: { hours: TIER_SUPPORT_REPLY_HOURS.max } }, ...(options.wishlistLive ? [wishlist] : [])],
    soon: [{ key: 'batch', values: { count: 30 } }, { key: 'earlyAccess' }, ...(options.wishlistLive ? [] : [wishlist])],
  }
}
