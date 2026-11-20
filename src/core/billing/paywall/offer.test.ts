import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { packOffers, perCreditUsd, perMonthUsd, tierOffers, usdFormat, planSavingPct, yearlySaving, yearlySavingUsd } from './offer'

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

  it('saves $47.80 / $119.80 / $475 a year; each plan\'s percent is rounded down', () => {
    expect(offers.map(yearlySavingUsd)).toEqual([47.8, 119.8, 475])
    // Max: 1 − 713 / 1188 = 39.98% → 39% (a claim must hold, so never rounded up).
    expect(offers.map(planSavingPct)).toEqual([20, 20, 39])
    expect(yearlySaving(offers)).toMatchObject({ pct: 20, upTo: 39 })
  })

  // The live yearly prices ($191.04 / $479.04 / $891, Owner 2026-11-21 keeps them): 20 / 20 / 25%.
  it('reports each plan\'s own saving, the smallest and the largest', () => {
    const live = { starter: 191.04, pro: 479.04, max: 891 } as Record<string, number>
    const v2 = tierOffers(TEST_PRODUCTS.map(p => p.interval === 'year' ? { ...p, priceUsd: live[p.tier]! } : p))
    expect(yearlySaving(v2)).toEqual({ pct: 20, upTo: 25, byTier: [{ tier: 'starter', pct: 20 }, { tier: 'pro', pct: 20 }, { tier: 'max', pct: 25 }] })
    expect(yearlySaving(tierOffers(TEST_PRODUCTS.filter(p => p.interval !== 'year')))).toBeNull()
  })

  it('spreads the yearly price over twelve months', () => {
    expect(perMonthUsd(offer('starter'), 'year')).toBe(15.92)
    expect(perMonthUsd(offer('pro'), 'year')).toBe(39.92)
    expect(perMonthUsd(offer('max'), 'year')).toBe(59.42)
    expect(perMonthUsd(offer('pro'), 'month')).toBe(49.9)
  })

  it('prices a credit with half-cents rounded up', () => {
    expect(perCreditUsd(offer('starter').monthly!)).toBe(19.9 / 50)
    expect(perCreditUsd(offer('max').yearly!)).toBe(713 / 3360)
    expect(perCreditUsd(packOffers(TEST_PRODUCTS)[0]!)).toBe(9.9 / 20)
  })

  it('formats whole dollars without cents', () => {
    expect(new Intl.NumberFormat('en-US', usdFormat(191)).format(191)).toBe('$191')
    expect(new Intl.NumberFormat('en-US', usdFormat(19.9)).format(19.9)).toBe('$19.90')
  })

  it('hides tiers whose price is not decided', () => {
    const undecided = TEST_PRODUCTS.map((p) => (p.id === 'max_yearly' ? { ...p, priceUsd: 0 } : p))
    expect(tierOffers(undecided, 'month').map(o => o.tier)).toContain('max')
    expect(tierOffers(undecided, 'year').map((o) => o.tier)).toEqual(['starter', 'pro'])
  })
})
