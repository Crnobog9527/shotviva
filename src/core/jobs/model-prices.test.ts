import { describe, expect, it } from 'vitest'

import { jobCostUsd } from './job-cost'
import { effectivePrices, MODEL_PRICES, officialPrice } from './model-prices'

const NONE = { inputTextPerM: null, inputImagePerM: null, outputPerM: null }

describe('MODEL_PRICES', () => {
  it('cites a source and a date for every entry, and has no negative price', () => {
    for (const [model, entry] of Object.entries(MODEL_PRICES)) {
      expect(model).toBe(model.trim().toLowerCase())
      expect(entry.source).toMatch(/^https:\/\/developers\.openai\.com\//)
      expect(entry.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const value of Object.values(entry.prices)) expect(value === null || value >= 0).toBe(true)
    }
  })

  it('knows the models in use and leaves out one whose price was not confirmed', () => {
    expect(officialPrice('gpt-image-2.6-sunburst')?.prices).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 })
    expect(officialPrice('gpt-image-2.5-sunburst')?.prices).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 })
    expect(officialPrice('gpt-6-luna')?.prices).toEqual({ inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 })
    // Not on OpenAI's pricing page on 2026-11-06: never guessed.
    expect(officialPrice('gpt-image-2.6')).toBeNull()
  })

  it('matches the exact name ignoring case and spaces, never a prototype key or a prefix', () => {
    expect(officialPrice('  GPT-Image-2.6-Sunburst ')).not.toBeNull()
    expect(officialPrice('constructor')).toBeNull()
    expect(officialPrice('gpt-image-2.6-sunburst-preview')).toBeNull()
  })
})

describe('effectivePrices', () => {
  it("keeps the row's own prices and fills only the empty ones from the table", () => {
    expect(effectivePrices('gpt-image-2.6-sunburst', NONE)).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 })
    expect(effectivePrices('gpt-image-2.6-sunburst', { ...NONE, outputPerM: 40 })).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 40 })
    // 0 is a price the Owner typed, not an empty field.
    expect(effectivePrices('gpt-image-2.6-sunburst', { ...NONE, inputTextPerM: 0 })?.inputTextPerM).toBe(0)
  })

  it('uses the table with no row (env fallback) and gives null when neither has a price', () => {
    expect(effectivePrices('gpt-image-2.5-sunburst', null)).toEqual(MODEL_PRICES['gpt-image-2.5-sunburst']?.prices)
    expect(effectivePrices('gpt-image-2.6', null)).toBeNull()
    expect(effectivePrices('gpt-image-2.6', NONE)).toBeNull()
    expect(effectivePrices('gpt-image-2.6', { ...NONE, outputPerM: 30 })).toEqual({ ...NONE, outputPerM: 30 })
  })

  it('costs a job from the table when the row is empty, and leaves it uncosted when neither has prices', () => {
    const usage = { input_text_tokens: 1_000, input_image_tokens: 2_000, output_tokens: 4_000 }
    // 1k × $5 + 2k × $8 + 4k × $30 per 1M = 0.005 + 0.016 + 0.12
    expect(jobCostUsd(usage, effectivePrices('gpt-image-2.6-sunburst', NONE))).toBeCloseTo(0.141, 6)
    expect(jobCostUsd(usage, effectivePrices('gpt-image-2.6', NONE))).toBeNull()
    // The decision step at gpt-6-luna's table price: 500 × $0.10 + 50 × $0.50 per 1M.
    const decision = { ...usage, decision_input_tokens: 500, decision_output_tokens: 50 }
    expect(jobCostUsd(decision, effectivePrices('gpt-image-2.6-sunburst', NONE), effectivePrices('gpt-6-luna', NONE))).toBeCloseTo(0.141075, 6)
  })
})
