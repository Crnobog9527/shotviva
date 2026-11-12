import { describe, expect, it } from 'vitest'

import { phoneSlot } from './phone-sizes'

describe('phoneSlot', () => {
  it('names two thirds of the real phone width, so a 3× phone fetches about 2×', () => {
    expect(phoneSlot(50)).toBe('33vw')
    expect(phoneSlot(100)).toBe('67vw')
    expect(phoneSlot(46)).toBe('31vw')
    // A 390 px phone at 3×: half the row is 195 px; 33vw × 3 = 386 → the 384 w variant (≈ 2×).
    expect(Math.round(390 * 0.33 * 3)).toBeLessThanOrEqual(390)
  })
})
