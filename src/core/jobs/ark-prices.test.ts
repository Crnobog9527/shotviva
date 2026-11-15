import { describe, expect, it } from 'vitest'

import { arkListCost, arkPriceSchema, type ArkPrice } from './ark-prices'

// Fixtures only: a real line's price is typed in by the admin (ai_providers.list_price).
const FLAT: ArkPrice = { model: 'doubao-x', outputBands: [{ maxPixels: null, cny: 0.12 }], inputImageCny: 0, source: 'https://example.com/p', asOf: '2026-11-15' }
const BANDED: ArkPrice = {
  model: 'doubao-x',
  outputBands: [{ maxPixels: 2_610_000, cny: 0.13 }, { maxPixels: 4_630_000, cny: 0.23 }],
  inputImageCny: 0.05, source: 'https://example.com/p', asOf: '2026-11-15',
}

describe('Ark list prices', () => {
  it('prices a single open-ended band at one rate for every size', () => {
    const oneK = arkListCost(FLAT, { generatedImages: 1, inputImages: 2, pixels: 1_048_576 }, 6.72)
    const twoK = arkListCost(FLAT, { generatedImages: 1, inputImages: 1, pixels: 4_194_304 }, 6.72)
    expect(oneK).toEqual({ list_cost_cny: 0.12, cny_per_usd: 6.72, list_cost_usd: 0.017857 })
    expect(twoK?.list_cost_usd).toBe(0.017857)
  })

  it('picks the band by pixel count and adds paid input images', () => {
    expect(arkListCost(BANDED, { generatedImages: 1, inputImages: 1, pixels: 1_048_576 }, 6.72)?.list_cost_cny).toBe(0.18)
    expect(arkListCost(BANDED, { generatedImages: 1, inputImages: 0, pixels: 4_194_304 }, 6.72)?.list_cost_cny).toBe(0.23)
  })

  it('has no cost without a price, or for an image larger than every band', () => {
    expect(arkListCost(null, { generatedImages: 1, inputImages: 0, pixels: 1 }, 6.72)).toBeNull()
    expect(arkListCost(BANDED, { generatedImages: 1, inputImages: 0, pixels: 9_000_000 }, 6.72)).toBeNull()
  })

  it('accepts what the admin form saves and refuses a price without its source', () => {
    expect(arkPriceSchema.safeParse(BANDED).success).toBe(true)
    expect(arkPriceSchema.safeParse({ ...BANDED, source: '' }).success).toBe(false)
    expect(arkPriceSchema.safeParse({ ...BANDED, asOf: 'yesterday' }).success).toBe(false)
  })
})
