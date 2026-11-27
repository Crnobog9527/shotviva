import type { MembershipTier, ProductId } from '../../config'

// What the buyer holds right now (T66). Its own file with no runtime imports: the paywall
// provider and /pricing hold it in their first load, while the rank rule that reads it
// (upgrade-rule.ts) is loaded on demand.
export type MemberStanding = {
  // The highest-ranked subscription that may still bill (Stripe or Waffo mirror, any live
  // status, cancelling ones too: their paid period is still running).
  subscription: ProductId | null
  subscriptionRank?: number
  // current_tier(): the tier of the latest membership purchase while paid_until runs. For a
  // one-time period (Alipay, Waffo one-time) this is all there is; it carries no interval.
  tier: MembershipTier | null
  // An active org staff member, not the owner (Owner 2026-11-22): buys nothing personally, so every buy button in the
  // paywall is locked with the reason. The checkout route refuses whatever the page shows (409
  // ORG_MEMBER_CHECKOUT); this only spares the click.
  orgMember?: boolean
  // The main admin of an active org (Owner 2026-11-27): what they buy goes to the org's credit
  // pool, so the paywall says where the credits will land. The settlement decides again.
  orgPool?: boolean
}

export const NO_STANDING: MemberStanding = { subscription: null, tier: null }

// The billing period of the subscription held: a yearly member's paywall and /pricing open on
// Yearly (DESIGN §4.5). A one-time period carries no interval, so it has none.
export function heldPeriod(standing: MemberStanding): 'month' | 'year' | null {
  if (standing.subscription === null) return null
  return standing.subscription.endsWith('_yearly') ? 'year' : 'month'
}

// Holds any membership at all: only then is the upgrade rule worth loading.
export function holdsMembership(standing: MemberStanding): boolean {
  return standing.subscription !== null || standing.tier !== null
}
