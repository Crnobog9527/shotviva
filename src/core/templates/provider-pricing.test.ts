import { describe, expect, it } from 'vitest'

import { creditMinimum } from './pricing'
import { MISSING_COST, maxCostPerCredit, minimumCredits, modelCreditFloor } from './provider-pricing'

describe('model price floors', () => {
  const centBudget = maxCostPerCredit([{ priceUsd: 713, credits: 118800 }, { priceUsd: 1, credits: 100 }])
  it.each([[0.0095, 6], [0.019, 12], [0.055, 34], [0.0715, 44]])('cost %s requires %s credits in the pricing worksheet', (cost, credits) => {
    expect(minimumCredits(cost, centBudget)).toBe(credits)
  })
  it('prefers real p95, refuses unpriced supported tiers and leaves unavailable tiers alone', () => {
    const floor = modelCreditFloor({ openAI: false, resolutions: ['1k', '2k'], estimates: { '1k': 0.095 }, p95: { '1k': 0.019 } }, centBudget)
    expect(floor.high).toEqual({ '1k': 12, '2k': MISSING_COST, '4k': 1 })
  })
  it('keeps the existing OpenAI minimum in the current unit even for a cheap sample', () => {
    const budget = maxCostPerCredit([{ priceUsd: 713, credits: 3360 }])
    expect(modelCreditFloor({ openAI: true, resolutions: ['1k', '2k', '4k'], estimates: {}, p95: { '1k': 0.001 } }, budget).high)
      .toEqual({ '1k': 2, '2k': 4, '4k': 6 })
  })
  it('judges each quality on its own jobs when the read has the per-quality p95 (1295)', () => {
    // Pricey high runs on the route must not raise the medium floor; medium without ten samples of
    // its own falls back to the estimate, not to the mixed p95.
    const floor = modelCreditFloor({
      openAI: false, resolutions: ['1k', '2k'], estimates: { '1k': 0.019, '2k': 0.019 },
      p95: { '1k': 0.0715, '2k': 0.0715 }, p95ByQuality: { high: { '1k': 0.0715 }, medium: { '1k': 0.0095 } },
    }, centBudget)
    expect(floor.medium).toEqual({ '1k': 6, '2k': 12, '4k': 1 })
    expect(floor.high).toEqual({ '1k': 44, '2k': 12, '4k': 1 })
  })
})

describe('slot template floors (1442)', () => {
  const budget = 0.01
  const base = { openAI: false, resolutions: ['1k', '2k'] as const, p95: {}, estimates: { '1k': 0.05, '2k': 0.05 } }
  const single = minimumCredits(0.05, budget)

  it('falls back to single × slots without data', () => {
    const floor = modelCreditFloor({ ...base, resolutions: [...base.resolutions] }, budget)
    expect(floor.slots).toBeUndefined()
    expect(creditMinimum(floor, 'medium', '1k', 3)).toBe(single * 3)
    expect(creditMinimum(floor, 'medium', '1k', 1)).toBe(single)
  })

  it('adds the extra input images, or uses the full-slot p95 (never below the single floor)', () => {
    const floor = modelCreditFloor({ ...base, resolutions: [...base.resolutions], slotCosts: {
      extraInputUsd: 0.01, p95Full: { medium: { '1k': { '4': 0.001 }, '2k': { '2': 0.2 } } },
    } }, budget)
    expect(creditMinimum(floor, 'medium', '1k', 3)).toBe(single + Math.ceil(2 * 0.01 * 1.10 / budget))
    expect(creditMinimum(floor, 'medium', '1k', 4)).toBe(single)
    expect(creditMinimum(floor, 'medium', '2k', 2)).toBe(Math.ceil(0.2 * 1.10 / budget))
    // The template's approved tariff still stands above the route floor.
    expect(creditMinimum({ ...floor, tariff: { quality: 'medium', costs: { '1k': 99, '2k': 99, '4k': 99 } } }, 'medium', '1k', 3)).toBe(99)
  })
})
