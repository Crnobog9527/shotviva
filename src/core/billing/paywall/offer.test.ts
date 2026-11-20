import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { packOffers, perCreditUsd, perMonthUsd, tierOffers, usdFormat, yearlySaving, yearlySavingUsd } from './offer'

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
    expect(yearlySaving(offers)).toEqual({ pct: 40, upTo: true, freeMonths: null })
  })

  // Pricing O2 (Owner 2026-11-21): every yearly price is ten monthly ones, about 16.7% off.
  it('says "2 months free, about 17%" only when every plan gets exactly that', () => {
    const at = (yearly: Record<string, number>) => tierOffers(TEST_PRODUCTS.map(p => p.interval === 'year' ? { ...p, priceUsd: yearly[p.tier]! } : p))
    const monthly = Object.fromEntries(offers.map(o => [o.tier, o.monthly!.priceUsd]))
    const o2 = at(Object.fromEntries(Object.entries(monthly).map(([tier, usd]) => [tier, Math.round(usd * 1000) / 100])))
    expect(yearlySaving(o2)).toEqual({ pct: 17, upTo: false, freeMonths: 2 })
    // One plan still on its old yearly price: back to "up to".
    expect(yearlySaving(at({ ...Object.fromEntries(Object.entries(monthly).map(([t, usd]) => [t, Math.round(usd * 1000) / 100])), max: 713 }))?.upTo).toBe(true)
    // A cent above ten months: no whole months and the plans differ a little, so "up to".
    expect(yearlySaving(at(Object.fromEntries(Object.entries(monthly).map(([t, usd]) => [t, Math.round(usd * 1000) / 100 + 0.01]))))).toMatchObject({ upTo: true })
    // Exactly 20% off every plan: the same saving for each, no "up to".
    expect(yearlySaving(at(Object.fromEntries(Object.entries(monthly).map(([t, usd]) => [t, Math.round(usd * 960) / 100]))))).toEqual({ pct: 20, upTo: false, freeMonths: null })
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
