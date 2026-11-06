import { describe, expect, it } from 'vitest'

import { jobCostUsd } from './job-cost'

const PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }

describe('jobCostUsd', () => {
  it('prices each part per million tokens and rounds to the column scale', () => {
    // 1,000 × $5 + 2,000 × $8 + 4,000 × $30, per million = 0.005 + 0.016 + 0.12
    expect(jobCostUsd({ input_text_tokens: 1000, input_image_tokens: 2000, output_tokens: 4000 }, PRICES)).toBe(0.141)
    expect(jobCostUsd({ input_text_tokens: 1, input_image_tokens: 0, output_tokens: 0 }, PRICES)).toBe(0.000005)
    expect(jobCostUsd({ input_text_tokens: 3, input_image_tokens: 3, output_tokens: 3 }, PRICES)).toBe(0.000129)
  })

  it('is null without usage or without a price snapshot (env fallback)', () => {
    expect(jobCostUsd(null, PRICES)).toBeNull()
    expect(jobCostUsd(undefined, PRICES)).toBeNull()
    expect(jobCostUsd({ input_text_tokens: 1, input_image_tokens: 1, output_tokens: 1 }, null)).toBeNull()
  })

  it('is null when a token count is missing: never a guess', () => {
    expect(jobCostUsd({ input_text_tokens: 1000, output_tokens: 4000 }, PRICES)).toBeNull()
    expect(jobCostUsd({ input_text_tokens: 1000, input_image_tokens: 2000 }, PRICES)).toBeNull()
  })

  it('is null when a needed price is not filled in, but a zero-token part needs none', () => {
    const noImagePrice = { ...PRICES, inputImagePerM: null }
    expect(jobCostUsd({ input_text_tokens: 1000, input_image_tokens: 2000, output_tokens: 4000 }, noImagePrice)).toBeNull()
    expect(jobCostUsd({ input_text_tokens: 1000, input_image_tokens: 0, output_tokens: 4000 }, noImagePrice)).toBe(0.125)
  })

  it("adds the decision step's tokens at the decision provider's input and output prices (T30)", () => {
    const usage = { input_text_tokens: 1000, input_image_tokens: 0, output_tokens: 0, decision_input_tokens: 2000, decision_output_tokens: 500 }
    const decision = { inputTextPerM: 2, inputImagePerM: null, outputPerM: 8 }
    // 0.005 + 2,000 × $2 / 1M + 500 × $8 / 1M
    expect(jobCostUsd(usage, PRICES, decision)).toBe(0.013)
    expect(jobCostUsd(usage, PRICES)).toBeNull()
    expect(jobCostUsd(usage, PRICES, { ...decision, outputPerM: null })).toBeNull()
  })
})
