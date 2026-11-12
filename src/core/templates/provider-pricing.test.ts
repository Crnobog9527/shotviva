import { describe, expect, it } from 'vitest'

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
})
