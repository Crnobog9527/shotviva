import { describe, expect, it } from 'vitest'

import { estimateRunUsd } from '../../src/modules/image/test-run/estimate'
import { cellEstimateUsd, JUDGE_ALLOWANCE_USD } from './estimate'

const cell = { resolution: '1k' as const }

describe('cellEstimateUsd', () => {
  it('uses a per-image provider’s own estimate for that tier', () => {
    const usd = cellEstimateUsd(cell, 'medium', { prices: null, estimatedImageCosts: { '1k': 0.018, '2k': 0.018 } })
    expect(usd).toBeCloseTo(0.018 + JUDGE_ALLOWANCE_USD, 6)
  })

  it('falls back to the token estimate when the tier has no per-image cost', () => {
    const prices = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
    const usd = cellEstimateUsd({ resolution: '2k' }, 'medium', { prices, estimatedImageCosts: { '1k': 0.018 } })
    expect(usd).toBeCloseTo(estimateRunUsd('2k', 'medium', prices) + JUDGE_ALLOWANCE_USD, 6)
  })

  it('never adds a fallback model’s price to a bound provider’s estimate', () => {
    const cheap = cellEstimateUsd(cell, 'medium', { estimatedImageCosts: { '1k': 0.018 } })
    expect(cheap).toBeLessThan(estimateRunUsd('1k', 'medium', null))
  })
})
