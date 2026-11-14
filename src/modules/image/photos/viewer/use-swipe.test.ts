import { describe, expect, it } from 'vitest'

import { swipeDelta } from './use-swipe'

describe('swipeDelta', () => {
  it('steps forward on a left swipe and back on a right swipe', () => {
    expect(swipeDelta(-80, 10)).toBe(1)
    expect(swipeDelta(80, -10)).toBe(-1)
  })

  it('ignores short or mostly vertical moves', () => {
    expect(swipeDelta(-30, 0)).toBeNull()
    expect(swipeDelta(-60, 50)).toBeNull()
    expect(swipeDelta(0, 200)).toBeNull()
  })
})
