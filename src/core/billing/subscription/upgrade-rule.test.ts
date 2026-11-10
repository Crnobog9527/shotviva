import { describe, expect, it } from 'vitest'

import type { ProductId } from '../../config'
import { blockReason, membershipRank, NO_STANDING, purchaseVerdict, type MemberStanding } from './upgrade-rule'

// ARCHITECTURE §6.2 「升级」 (Owner 2026-11-07, T66): starter < pro < max, monthly < yearly on one
// tier; only upwards while a membership runs.

const PLANS: ProductId[] = ['starter_monthly', 'starter_yearly', 'pro_monthly', 'pro_yearly', 'max_monthly', 'max_yearly']
const sub = (subscription: ProductId): MemberStanding => ({ subscription, tier: subscription.split('_')[0] as MemberStanding['tier'] })

describe('membershipRank', () => {
  it('orders tier first, then the interval', () => {
    expect(PLANS.map(membershipRank)).toEqual([0, 1, 2, 3, 4, 5])
    // A higher tier monthly still outranks a lower tier yearly.
    expect(membershipRank('pro_monthly')).toBeGreaterThan(membershipRank('starter_yearly'))
  })

  it('does not rank packs', () => {
    expect(membershipRank('pack_s')).toBe(-1)
    expect(membershipRank('pack_l')).toBe(-1)
  })
})

describe('purchaseVerdict with a subscription', () => {
  it.each(PLANS)('from %s: every higher plan is an upgrade, the same or lower is blocked', (held) => {
    for (const target of PLANS) {
      const expected = membershipRank(target) > membershipRank(held) ? 'upgrade' : 'blocked'
      expect(purchaseVerdict(sub(held), target)).toBe(expected)
    }
  })

  it('Starter monthly → Pro monthly and Pro monthly → Pro yearly are upgrades; Pro → Starter is not', () => {
    expect(purchaseVerdict(sub('starter_monthly'), 'pro_monthly')).toBe('upgrade')
    expect(purchaseVerdict(sub('pro_monthly'), 'pro_yearly')).toBe('upgrade')
    expect(purchaseVerdict(sub('pro_monthly'), 'starter_monthly')).toBe('blocked')
    expect(purchaseVerdict(sub('pro_yearly'), 'pro_monthly')).toBe('blocked')
  })

  it('packs are always open', () => {
    expect(purchaseVerdict(sub('max_yearly'), 'pack_s')).toBe('buy')
  })
})

describe('purchaseVerdict without a subscription', () => {
  it('a new buyer buys anything', () => {
    for (const target of PLANS) expect(purchaseVerdict(NO_STANDING, target)).toBe('buy')
  })

  // A one-time period (Alipay, Waffo one-time) only knows its tier through current_tier().
  it('a one-time Starter period: Pro and Max are upgrades, Starter again is a renewal', () => {
    const period: MemberStanding = { subscription: null, tier: 'starter' }
    expect(purchaseVerdict(period, 'pro_monthly')).toBe('upgrade')
    expect(purchaseVerdict(period, 'max_yearly')).toBe('upgrade')
    expect(purchaseVerdict(period, 'starter_monthly')).toBe('buy')
    expect(purchaseVerdict(period, 'starter_yearly')).toBe('buy')
  })

  it('a one-time Pro period blocks Starter', () => {
    const period: MemberStanding = { subscription: null, tier: 'pro' }
    expect(purchaseVerdict(period, 'starter_yearly')).toBe('blocked')
    expect(purchaseVerdict(period, 'pro_monthly')).toBe('buy')
  })

  it('a lower subscription next to a higher one-time period: the stricter answer wins', () => {
    const mixed: MemberStanding = { subscription: 'starter_monthly', tier: 'pro' }
    expect(purchaseVerdict(mixed, 'starter_yearly')).toBe('blocked')
    expect(purchaseVerdict(mixed, 'pro_monthly')).toBe('upgrade')
  })
})

describe('blockReason', () => {
  it('names the running plan "current" and anything lower "lower"', () => {
    expect(blockReason(sub('pro_monthly'), 'pro_monthly')).toBe('current')
    expect(blockReason(sub('pro_monthly'), 'starter_yearly')).toBe('lower')
    expect(blockReason(sub('pro_yearly'), 'pro_monthly')).toBe('lower')
    expect(blockReason({ subscription: null, tier: 'max' }, 'pro_yearly')).toBe('lower')
  })

  it('is null for what can be bought', () => {
    expect(blockReason(sub('pro_monthly'), 'max_monthly')).toBeNull()
    expect(blockReason(NO_STANDING, 'starter_monthly')).toBeNull()
    expect(blockReason(sub('max_yearly'), 'pack_m')).toBeNull()
  })
})

it('uses the catalog entitlement for a named membership with no tier in its SKU', () => {
  const held = { subscription: 'studio_monthly', subscriptionRank: 2, tier: 'pro' } as const
  expect(blockReason(held, 'studio_monthly', 2)).toBe('current')
  expect(purchaseVerdict(held, 'pro_monthly')).toBe('blocked')
  expect(purchaseVerdict(held, 'hobby_yearly', 1)).toBe('blocked')
  expect(purchaseVerdict(held, 'studio_yearly', 3)).toBe('upgrade')
  expect(purchaseVerdict({ ...held, subscription: null }, 'studio_monthly', 2)).toBe('buy')
})
