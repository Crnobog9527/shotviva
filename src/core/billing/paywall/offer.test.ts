import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { packOffers, perCreditUsd, perMonthUsd, tierOffers, usdFormat, yearlySavingPct, yearlySavingUsd } from './offer'
import { TIER_LIMITS } from '../tier-limits'
import { tierPerks } from './perks'

const offers = tierOffers(TEST_PRODUCTS)
const offer = (tier: string) => {
  const found = offers.find((o) => o.tier === tier)
  if (!found) throw new Error(tier)
  return found
}

describe('paywall numbers (DESIGN §4.5, all from the config)', () => {
  it('orders the tiers Starter, Pro, Max and the packs by price', () => {
    expect(offers.map((o) => o.tier)).toEqual(['starter', 'pro', 'max'])
    expect(packOffers(TEST_PRODUCTS).map((p) => p.id)).toEqual(['pack_s', 'pack_m', 'pack_l'])
  })

  it('saves $47.80 / $119.80 / $475 a year; "up to" is the largest saving, rounded to a whole percent', () => {
    expect(offers.map(yearlySavingUsd)).toEqual([47.8, 119.8, 475])
    // Max: 1 − 713 / 1188 = 39.98% → 40% (DESIGN §6.9: rounded to the nearest whole percent).
    expect(yearlySavingPct(offers)).toBe(40)
  })

  it('spreads the yearly price over twelve months', () => {
    expect(perMonthUsd(offer('starter'), 'year')).toBe(15.92)
    expect(perMonthUsd(offer('pro'), 'year')).toBe(39.92)
    expect(perMonthUsd(offer('max'), 'year')).toBe(59.42)
    expect(perMonthUsd(offer('pro'), 'month')).toBe(49.9)
  })

  it('prices a credit with half-cents rounded up', () => {
    expect(perCreditUsd(offer('starter').monthly)).toBe(19.9 / 50)
    expect(perCreditUsd(offer('max').yearly)).toBe(713 / 3360)
    expect(perCreditUsd(packOffers(TEST_PRODUCTS)[0]!)).toBe(9.9 / 20)
  })

  it('formats whole dollars without cents', () => {
    expect(new Intl.NumberFormat('en-US', usdFormat(191)).format(191)).toBe('$191')
    expect(new Intl.NumberFormat('en-US', usdFormat(19.9)).format(19.9)).toBe('$19.90')
  })

  it('hides tiers whose price is not decided', () => {
    const undecided = TEST_PRODUCTS.map((p) => (p.id === 'max_yearly' ? { ...p, priceUsd: 0 } : p))
    expect(tierOffers(undecided).map((o) => o.tier)).toEqual(['starter', 'pro'])
  })
})

describe('tier perks (ARCHITECTURE §6.2 会员档位权益)', () => {
  it('lists the concurrency of each tier as live', () => {
    const count = (tier: 'starter' | 'pro' | 'max') =>
      tierPerks(tier, { wishlistLive: false }).live.find((p) => p.key === 'concurrency')?.values?.count
    expect([count('starter'), count('pro'), count('max')]).toEqual([1, 3, 6])
  })

  it('reads every number from TIER_LIMITS: batch 10 / 30 live on Pro and Max, support 48 / 48 / 24 hours', () => {
    const value = (tier: 'starter' | 'pro' | 'max', key: string) => tierPerks(tier, { wishlistLive: false }).live.find((p) => p.key === key)?.values
    expect(value('pro', 'batch')).toEqual({ count: TIER_LIMITS.pro.batchMax })
    expect(value('max', 'batch')).toEqual({ count: TIER_LIMITS.max.batchMax })
    expect([value('pro', 'batch')?.count, value('max', 'batch')?.count]).toEqual([10, 30])
    expect(value('starter', 'support48h')).toEqual({ hours: 48 })
    expect(value('max', 'support24h')).toEqual({ hours: 24 })
    // Pro's support time equals Starter's, so "Everything in Starter, plus" adds no support line.
    expect(tierPerks('pro', { wishlistLive: false }).live.map((p) => p.key)).toEqual(['concurrency', 'batch'])
    expect(tierPerks('starter', { wishlistLive: false }).live.map((p) => p.key)).not.toContain('batch')
  })

  it('omits unbuilt perks and never lists queue priority', () => {
    const pro = tierPerks('pro', { wishlistLive: false })
    expect(pro.soon.map((p) => p.key)).toEqual([])
    expect(tierPerks('max', { wishlistLive: true }).soon.map((p) => p.key)).toEqual([])
    const all = (['starter', 'pro', 'max'] as const).flatMap((tier) => {
      const perks = tierPerks(tier, { wishlistLive: true })
      return [...perks.live, ...perks.soon].map((p) => p.key)
    })
    expect(all.some((key) => /queue|priority/i.test(key))).toBe(false)
    // Support replies (ARCHITECTURE §6.2): Starter and Pro 48 hours, Max 24 hours.
    expect(tierPerks('starter', { wishlistLive: false }).live.map((p) => p.key)).toContain('support48h')
    expect(pro.live.map((p) => p.key)).toEqual(['concurrency', 'batch'])
    expect(tierPerks('max', { wishlistLive: false }).live.map((p) => p.key)).toEqual(['concurrency', 'batch', 'support24h'])
    expect([TIER_LIMITS.starter.supportHours, TIER_LIMITS.pro.supportHours, TIER_LIMITS.max.supportHours]).toEqual([48, 48, 24])
  })

  it('lists the 3× vote only while the wishlist is on', () => {
    const off = tierPerks('max', { wishlistLive: false })
    const on = tierPerks('max', { wishlistLive: true })
    expect(off.soon).toEqual([])
    expect(off.live.map((p) => p.key)).not.toContain('wishlistVotes')
    expect(on.live.map((p) => p.key)).toContain('wishlistVotes')
  })
})
