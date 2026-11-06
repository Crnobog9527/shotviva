import type { MembershipTier, ProductInterval, SiteProduct } from '../../config'

// What the account page's Subscription block shows (DESIGN §4.5), from the mirror (Stripe's
// state, ARCHITECTURE §6.2), paid_until and current_tier. Pure, so every state is unit-tested.

export type MirrorRow = {
  stripeSubscriptionId: string
  productId: string
  status: string
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export type SubscriptionState = 'active' | 'cancels' | 'past_due' | 'paused'

export type SubscriptionSummary =
  // A card subscription that is still Stripe's to renew. "Manage subscription" opens the Portal.
  | {
      kind: 'subscription'
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

function liveSubscription(input: Input): SubscriptionSummary | null {
  // Newest first: a buyer who cancelled and subscribed again sees the new one.
  const sorted = [...input.rows].sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime())
  for (const row of sorted) {
    const live = LIVE[row.status]
    const product = input.products.find((p) => p.id === row.productId)
    if (!live || !product || product.tier === 'pack') continue
    const state = live === 'active' && row.cancelAtPeriodEnd ? 'cancels' : live
    const expired = input.paidUntil === null || input.paidUntil <= input.now
    return { kind: 'subscription', tier: product.tier, interval: product.interval, state, periodEnd: row.currentPeriodEnd, expired }
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
