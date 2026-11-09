import type { MembershipTier } from '../../config'
import { TIER_LIMITS } from '../tier-limits'

// Only shipped tier benefits are shown. Limits come from the table used by the server.
export type Perk = { key: string; values?: Record<string, number> }
export type TierPerks = { heading: 'includes' | 'plusStarter' | 'plusPro'; live: Perk[]; soon: Perk[] }

const concurrency = (tier: MembershipTier): Perk => ({ key: 'concurrency', values: { count: TIER_LIMITS[tier].concurrency } })
const batch = (tier: MembershipTier): Perk => ({ key: 'batch', values: { count: TIER_LIMITS[tier].batchMax } })
const support = (key: string, tier: MembershipTier): Perk => ({ key, values: { hours: TIER_LIMITS[tier].supportHours } })

export function tierPerks(tier: MembershipTier, options: { wishlistLive: boolean }): TierPerks {
  if (tier === 'starter') {
    return {
      heading: 'includes',
      live: [{ key: 'noWatermark' }, { key: 'privateAllTemplates' }, concurrency('starter'), support('support48h', 'starter')],
      soon: [],
    }
  }
  // Batch upload shipped for Pro and Max together (T28, Owner 2026-11-06). Pro answers support
  // as fast as Starter (48 hours), so it lists no support line of its own.
  if (tier === 'pro') {
    return { heading: 'plusStarter', live: [concurrency('pro'), batch('pro')], soon: [] }
  }
  // The 3× wishlist vote ships with the wishlist (T12); show it only while enabled.
  const wishlist: Perk = { key: 'wishlistVotes', values: { weight: 3 } }
  return {
    heading: 'plusPro',
    live: [concurrency('max'), batch('max'), support('support24h', 'max'), ...(options.wishlistLive ? [wishlist] : [])],
    soon: [],
  }
}
