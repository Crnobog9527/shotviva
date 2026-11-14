import { describe, expect, it } from 'vitest'

import { estimateRunUsd, INPUT_ALLOWANCE_USD, providerRunEstimateUsd } from './estimate'

describe('estimateRunUsd (what a running test run holds against the budget)', () => {
  it('prices the tier’s square at the output rate, plus the input allowance', () => {
    // 1024² high on GPT Image 2.6 is 1,756 output tokens at $30 / M.
    expect(estimateRunUsd('1k', 'high', null)).toBeCloseTo((1756 * 30) / 1e6 + INPUT_ALLOWANCE_USD, 6)
    expect(estimateRunUsd('4k', 'high', null)).toBeGreaterThan(estimateRunUsd('2k', 'high', null))
    expect(estimateRunUsd('2k', 'high', null)).toBeGreaterThan(estimateRunUsd('1k', 'high', null))
  })

  it('uses the provider’s own output price when it has one', () => {
    const doubled = estimateRunUsd('1k', 'high', { inputTextPerM: null, inputImagePerM: null, outputPerM: 60 })
    expect(doubled - INPUT_ALLOWANCE_USD).toBeCloseTo(2 * (estimateRunUsd('1k', 'high', null) - INPUT_ALLOWANCE_USD), 6)
  })
})

describe('providerRunEstimateUsd (the trial hold by the provider row)', () => {
  const ark = { prices: null, estimatedImageCosts: { '1k': 0.018, '2k': 0.018 }, extraInputImageUsd: null }

  it('holds a per-image provider’s 预估单张总成本 for the tier, not the GPT token estimate', () => {
    expect(providerRunEstimateUsd('1k', 'medium', ark)).toBe(0.018)
    expect(providerRunEstimateUsd('1k', 'medium', ark)).toBeLessThan(estimateRunUsd('1k', 'medium', null) / 3)
  })

  it('adds extra_input_image_usd for each photo past the first', () => {
    const slots = { ...ark, estimatedImageCosts: { '1k': 0.03 }, extraInputImageUsd: 0.0075 }
    expect(providerRunEstimateUsd('1k', 'medium', slots, 3)).toBe(0.045)
    expect(providerRunEstimateUsd('1k', 'medium', slots, 1)).toBe(0.03)
    expect(providerRunEstimateUsd('1k', 'medium', slots, 0)).toBe(0.03)
  })

  it('keeps the token estimate for OpenAI rows (no per-image cost) and for a tier without one', () => {
    const prices = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
    expect(providerRunEstimateUsd('1k', 'medium', { prices, estimatedImageCosts: {}, extraInputImageUsd: 0.0125 }, 3))
      .toBe(estimateRunUsd('1k', 'medium', prices))
    expect(providerRunEstimateUsd('4k', 'medium', ark)).toBe(estimateRunUsd('4k', 'medium', null))
  })
})
