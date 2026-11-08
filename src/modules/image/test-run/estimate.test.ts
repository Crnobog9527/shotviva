import { describe, expect, it } from 'vitest'

import { estimateRunUsd, INPUT_ALLOWANCE_USD } from './estimate'

describe('estimateRunUsd (what a running test run holds against the budget)', () => {
  it('prices the tier’s square at the output rate, plus the input allowance', () => {
    // 1024² high on GPT Image 2.6 is 1,756 output tokens at $30 / M.
    expect(estimateRunUsd('1k', 'high', null)).toBeCloseTo((1756 * 30) / 1e6 + INPUT_ALLOWANCE_USD, 6)
    expect(estimateRunUsd('3k', 'high', null)).toBeGreaterThan(estimateRunUsd('2k', 'high', null))
    expect(estimateRunUsd('2k', 'high', null)).toBeGreaterThan(estimateRunUsd('1k', 'high', null))
  })

  it('uses the provider’s own output price when it has one', () => {
    const doubled = estimateRunUsd('1k', 'high', { inputTextPerM: null, inputImagePerM: null, outputPerM: 60 })
    expect(doubled - INPUT_ALLOWANCE_USD).toBeCloseTo(2 * (estimateRunUsd('1k', 'high', null) - INPUT_ALLOWANCE_USD), 6)
  })
})
