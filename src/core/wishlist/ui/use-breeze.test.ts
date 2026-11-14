import { describe, expect, it } from 'vitest'

import { swayFromScroll } from './use-breeze'

describe('swayFromScroll', () => {
  it('turns scroll speed into a sway, clamped to ±6deg', () => {
    expect(swayFromScroll(0, 16)).toBe(0)
    expect(swayFromScroll(8, 16)).toBe(2)
    expect(swayFromScroll(-8, 16)).toBe(-2)
    expect(swayFromScroll(500, 16)).toBe(6)
    expect(swayFromScroll(-500, 16)).toBe(-6)
  })

  it('treats frames faster than 16ms as 16ms', () => {
    expect(swayFromScroll(8, 1)).toBe(2)
  })
})
