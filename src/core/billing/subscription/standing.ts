import type { MembershipTier, ProductId } from '../../config'

// What the buyer holds right now (T66). Its own file with no runtime imports: the paywall
// provider and /pricing hold it in their first load, while the rank rule that reads it
// (upgrade-rule.ts) is loaded on demand.
export type MemberStanding = {
  // The highest-ranked subscription that may still bill (Stripe or Waffo mirror, any live
  // status, cancelling ones too: their paid period is still running).
  subscription: ProductId | null
  // current_tier(): the tier of the latest membership purchase while paid_until runs. For a
  // one-time period (Alipay, Waffo one-time) this is all there is; it carries no interval.
  tier: MembershipTier | null
}

export const NO_STANDING: MemberStanding = { subscription: null, tier: null }

// Holds any membership at all: only then is the upgrade rule worth loading.
export function holdsMembership(standing: MemberStanding): boolean {
  return standing.subscription !== null || standing.tier !== null
}
