import { MEMBERSHIP_TIERS, type MembershipTier, type ProductInterval, type ProductId } from '../../config'
import type { MemberStanding } from './standing'

export { NO_STANDING, type MemberStanding } from './standing'

// Membership upgrades (Owner 2026-11-07, ARCHITECTURE §6.2 「升级」, T66): a membership is
// discounted credits, so an upgrade is the higher plan bought at full price; nothing is
// prorated. Only upwards: starter < pro < max, and on one tier monthly < yearly. Pure and
// client-safe: the checkout guard and the paywall / pricing labels read the same rule.

// Only the seeded IDs have a known tier without a catalog lookup. This fallback
// also serves old mirrors on PR previews before the identity RPC is deployed.
const seedPlans: readonly ProductId[] = ['starter_monthly', 'starter_yearly', 'pro_monthly', 'pro_yearly', 'max_monthly', 'max_yearly']
export function membershipRank(id: ProductId): number {
  return seedPlans.indexOf(id)
}

export function entitlementRank(tier: MembershipTier, period: ProductInterval): number {
  return MEMBERSHIP_TIERS.indexOf(tier) * 2 + Number(period === 'year')
}

function tierRank(tier: MembershipTier): number {
  return MEMBERSHIP_TIERS.indexOf(tier)
}

// buy: no membership in the way (or a pack). upgrade: higher than what is held; on payment the
// other renewing subscriptions are cancelled. blocked: equal or lower, 409 DOWNGRADE_NOT_ALLOWED.
export type PurchaseVerdict = 'buy' | 'upgrade' | 'blocked'

export function purchaseVerdict(standing: MemberStanding, productId: ProductId, target = membershipRank(productId)): PurchaseVerdict {
  if (target < 0) return productId.startsWith('pack_') ? 'buy' : 'blocked'
  let verdict: PurchaseVerdict = 'buy'
  // A subscription is compared plan for plan: the same plan again or anything lower is a
  // downgrade (or a second subscription); change only after it ends.
  if (standing.subscription) {
    if (target <= (standing.subscriptionRank ?? membershipRank(standing.subscription))) return 'blocked'
    verdict = 'upgrade'
  }
  // A one-time period knows only its tier: a lower tier is a downgrade, a higher one an upgrade,
  // the same tier extends the period as before T66 (the Alipay "Renew").
  if (standing.tier) {
    // A ranked id is `<tier>_<monthly|yearly>`.
    const tier = Math.floor(target / 2)
    const held = tierRank(standing.tier)
    if (tier < held) return 'blocked'
    if (tier > held) verdict = 'upgrade'
  }
  return verdict
}

// Why a plan cannot be bought, for the paywall and /pricing: it is the subscription already
// running ("Your plan"), or it ranks below what is held ("Can't switch down").
export type BlockReason = 'current' | 'lower'

export function blockReason(standing: MemberStanding, productId: ProductId, target = membershipRank(productId)): BlockReason | null {
  if (purchaseVerdict(standing, productId, target) !== 'blocked') return null
  return standing.subscription === productId ? 'current' : 'lower'
}
