import { describe, expect, it } from 'vitest'

import { arkListCost, arkPrice } from './ark-prices'

describe('Ark list prices', () => {
  it('prices Seedream 5.0 flash at ¥0.12 per image with free input images', () => {
    const price = arkPrice('doubao-seedream-5-0-flash-260915')
    const oneK = arkListCost(price, { generatedImages: 1, inputImages: 2, pixels: 1_048_576 }, 6.72)
    const twoK = arkListCost(price, { generatedImages: 1, inputImages: 1, pixels: 4_194_304 }, 6.72)
    expect(oneK).toEqual({ list_cost_cny: 0.12, cny_per_usd: 6.72, list_cost_usd: 0.017857 })
    expect(twoK?.list_cost_usd).toBe(0.017857)
  })

  it('keeps Seedream 5.5 banded with paid input images', () => {
    const price = arkPrice('doubao-seedream-5-5-261028')
    expect(arkListCost(price, { generatedImages: 1, inputImages: 1, pixels: 1_048_576 }, 6.72)?.list_cost_cny).toBe(0.18)
    expect(arkListCost(price, { generatedImages: 1, inputImages: 0, pixels: 4_194_304 }, 6.72)?.list_cost_cny).toBe(0.23)
  })

  it('has no price for a model it does not list', () => {
    expect(arkPrice('doubao-seedream-4-0')).toBeNull()
  })
})
