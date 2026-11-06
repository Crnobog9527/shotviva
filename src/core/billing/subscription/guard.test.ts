import { describe, expect, it } from 'vitest'

import { blockingSubscription } from './guard'
import type { MirrorRow } from './summary'

const row = (status: string, patch: Partial<MirrorRow> = {}): MirrorRow => ({
  provider: 'stripe',
  stripeSubscriptionId: 'sub_1',
  waffoOrderId: null,
  productId: 'pro_monthly',
  status,
  currentPeriodEnd: new Date('2026-12-06T00:00:00Z'),
  cancelAtPeriodEnd: false,
  ...patch,
})

// One running subscription per account (ARCHITECTURE §6.2: no upgrades in v1).
describe('blockingSubscription', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused'])('a %s subscription blocks a new membership', (status) => {
    expect(blockingSubscription([row(status)])).not.toBeNull()
  })

  it('a cancelled-but-paid-up one blocks too; Waffo rows count the same', () => {
    expect(blockingSubscription([row('active', { cancelAtPeriodEnd: true })])).not.toBeNull()
    expect(blockingSubscription([row('active', { provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1' })])).not.toBeNull()
  })

  it('ended or never-started subscriptions do not', () => {
    expect(blockingSubscription([row('canceled'), row('incomplete'), row('incomplete_expired')])).toBeNull()
    expect(blockingSubscription([])).toBeNull()
  })
})
