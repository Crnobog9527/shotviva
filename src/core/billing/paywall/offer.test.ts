import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { packOffers, perCreditUsd, perMonthUsd, tierOffers, usdFormat, yearlySavingPct, yearlySavingUsd } from './offer'
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

  it('saves $99.80 / $249.80 / $489 a year, at least 41%', () => {
    expect(offers.map(yearlySavingUsd)).toEqual([99.8, 249.8, 489])
    expect(yearlySavingPct(offers)).toBe(41)
  })

  it('spreads the yearly price over twelve months', () => {
    expect(perMonthUsd(offer('starter'), 'year')).toBe(11.58)
    expect(perMonthUsd(offer('pro'), 'year')).toBe(29.08)
    expect(perMonthUsd(offer('max'), 'year')).toBe(58.25)
    expect(perMonthUsd(offer('pro'), 'month')).toBe(49.9)
  })

  it('prices a credit with half-cents rounded up', () => {
    expect(perCreditUsd(offer('starter').monthly)).toBe(0.4)
    expect(perCreditUsd(offer('max').yearly)).toBe(0.21)
    expect(perCreditUsd(packOffers(TEST_PRODUCTS)[0]!)).toBe(0.5)
  })

  it('formats whole dollars without cents', () => {
    expect(new Intl.NumberFormat('en-US', usdFormat(139)).format(139)).toBe('$139')
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

  it('keeps unbuilt perks in Coming soon and never lists queue priority', () => {
    const pro = tierPerks('pro', { wishlistLive: false })
    expect(pro.soon.map((p) => p.key)).toEqual(['batch', 'brandKit'])
    const all = (['starter', 'pro', 'max'] as const).flatMap((tier) => {
      const perks = tierPerks(tier, { wishlistLive: true })
      return [...perks.live, ...perks.soon].map((p) => p.key)
    })
    expect(all.some((key) => /queue|priority/i.test(key))).toBe(false)
  })

  it('moves the 3× wishlist vote from Coming soon to live once the wishlist is on', () => {
    const off = tierPerks('max', { wishlistLive: false })
    const on = tierPerks('max', { wishlistLive: true })
    expect(off.soon.map((p) => p.key)).toContain('wishlistVotes')
    expect(off.live.map((p) => p.key)).not.toContain('wishlistVotes')
    expect(on.live.map((p) => p.key)).toContain('wishlistVotes')
  })
})
