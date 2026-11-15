import { describe, expect, it } from 'vitest'

import { imagesPerSet, setCredits } from './set-price'

describe('set price', () => {
  it('counts a poster template by its page kinds and everything else as one image', () => {
    expect(imagesPerSet({ poster: { kinds: [{}, {}] } })).toBe(2)
    expect(imagesPerSet({})).toBe(1)
    expect(imagesPerSet(undefined)).toBe(1)
    expect(imagesPerSet({ poster: { kinds: [] } })).toBe(1)
  })

  it('multiplies the per-image price by the images, never below one image', () => {
    expect(setCredits(120, 2)).toBe(240)
    expect(setCredits(120)).toBe(120)
    expect(setCredits(120, 0)).toBe(120)
  })
})
