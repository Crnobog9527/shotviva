import type { MembershipTier, ProductId, ProductInterval, SiteProduct } from '../../config'
import { membershipRank } from './upgrade-rule'

// What the account page's Subscription block shows (DESIGN §4.5), from the mirror (Stripe's or
// Waffo's state, ARCHITECTURE §6.2 / §6.3), paid_until and current_tier. Pure, so every state is unit-tested.

// Who bills it: Stripe (Portal) or Waffo (our own Cancel button, T50).
export type SubscriptionProvider = 'stripe' | 'waffo'

export type MirrorRow = {
  provider: SubscriptionProvider
  stripeSubscriptionId: string | null
  waffoOrderId: string | null
  productId: string
  status: string
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export type SubscriptionState = 'active' | 'cancels' | 'past_due' | 'paused'

export type SubscriptionSummary =
  // A card subscription still to be renewed. On Stripe "Manage subscription" opens the Portal; on
  // Waffo the card offers "Cancel subscription" (T50).
  | {
      kind: 'subscription'
      provider: SubscriptionProvider
      tier: MembershipTier
      interval: ProductInterval
      state: SubscriptionState
      // Renews on (active) or ends on (cancels): Stripe's current period end.
      periodEnd: Date
      // past_due: whether the paid period has already run out.
      expired: boolean
    }
  // An Alipay period (or a cancelled subscription whose time is left): "Paid until …" + Renew.
  | { kind: 'paid_until'; tier: MembershipTier | null; paidUntil: Date }
  // Membership ran out; paid credits stay usable (§6.2).
  | { kind: 'expired'; paidUntil: Date }
  | { kind: 'free' }

// Rows Stripe may still bill. canceled / incomplete* subscriptions no longer renew anything.
const LIVE: Partial<Record<string, Exclude<SubscriptionState, 'cancels'>>> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  paused: 'paused',
}

type Input = {
  rows: readonly MirrorRow[]
  paidUntil: Date | null
  tier: MembershipTier | null
  products: readonly SiteProduct[]
  now: Date
}

// A subscription that may still bill or renew: not canceled, never incomplete.
export const isLiveStatus = (status: string): boolean => LIVE[status] !== undefined

// Which row the card shows when there are several: after an upgrade (T66) the old plan's row
// stays in the mirror next to the new one, and either may be cancelling (Codex's Waffo run,
// 2026-11-07: with an old Starter and a cancelled Pro both ending the same day, the card said
// "Starter cancelled"). The card describes the plan the member holds now: the row of the
// current tier (current_tier(), the latest membership grant, i.e. the one that set
// paid_until); then the one that will renew; then the higher plan; then the latest end.
function shownFirst(rows: readonly MirrorRow[], tier: MembershipTier | null): MirrorRow[] {
  const holds = (row: MirrorRow) => (tier !== null && row.productId.startsWith(`${tier}_`) ? 0 : 1)
  const rank = (row: MirrorRow) => membershipRank(row.productId as ProductId)
  const renewing = (row: MirrorRow) => (LIVE[row.status] === 'active' && !row.cancelAtPeriodEnd ? 0 : 1)
  return [...rows].sort(
    (a, b) =>
      holds(a) - holds(b) ||
      renewing(a) - renewing(b) ||
      rank(b) - rank(a) ||
      b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime(),
  )
}

function liveSubscription(input: Input): SubscriptionSummary | null {
  for (const row of shownFirst(input.rows, input.tier)) {
    const live = LIVE[row.status]
    const product = input.products.find((p) => p.id === row.productId)
    if (!live || !product || product.tier === 'pack') continue
    const state = live === 'active' && row.cancelAtPeriodEnd ? 'cancels' : live
    const expired = input.paidUntil === null || input.paidUntil <= input.now
    return { kind: 'subscription', provider: row.provider, tier: product.tier, interval: product.interval, state, periodEnd: row.currentPeriodEnd, expired }
  }
  return null
}

export function summarizeSubscription(input: Input): SubscriptionSummary {
  const live = liveSubscription(input)
  if (live) return live
  if (input.paidUntil && input.paidUntil > input.now) {
    return { kind: 'paid_until', tier: input.tier, paidUntil: input.paidUntil }
  }
  return input.paidUntil ? { kind: 'expired', paidUntil: input.paidUntil } : { kind: 'free' }
}
