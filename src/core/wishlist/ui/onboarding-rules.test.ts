import { describe, expect, it } from 'vitest'

import { guideAction, isWishlistPath, showsTabDot, startTour, tourDone, tourJump, tourNext } from './onboarding-rules'

describe('wishlist first-run rules', () => {
  it('sends an eligible account to post, everyone else to make a photo first', () => {
    expect(guideAction(true)).toEqual({ href: '/wishlist/new', label: 'wish' })
    expect(guideAction(false)).toEqual({ href: '/generate', label: 'photoFirst' })
  })

  it('shows the tab dot until the wall is opened, here or on another device', () => {
    expect(showsTabDot(false, false)).toBe(true)
    expect(showsTabDot(true, false)).toBe(false)
    expect(showsTabDot(false, true)).toBe(false)
    expect(isWishlistPath('/wishlist')).toBe(true)
    expect(isWishlistPath('/wishlist/mine')).toBe(true)
    expect(isWishlistPath('/wishlists')).toBe(false)
    expect(isWishlistPath('/generate')).toBe(false)
  })
})

describe('the teaching sheet walk', () => {
  const STEPS = 3

  it('walks the steps in order and stops at the last', () => {
    const second = tourNext(startTour, STEPS)
    expect(second).toEqual({ step: 1, reached: 1, visit: 1 })
    const third = tourNext(second, STEPS)
    expect(third).toEqual({ step: 2, reached: 2, visit: 2 })
    expect(tourNext(third, STEPS)).toBe(third)
  })

  it('lets the dots go back to a step already seen, never forward past one not shown', () => {
    expect(tourJump(startTour, 1)).toBe(startTour)
    expect(tourJump(startTour, 2)).toBe(startTour)
    const second = tourNext(startTour, STEPS)
    expect(tourJump(second, 2)).toBe(second)
    const back = tourJump(second, 0)
    expect(back).toEqual({ step: 0, reached: 1, visit: 2 })
    expect(tourJump(back, 1)).toEqual({ step: 1, reached: 1, visit: 3 })
    expect(tourJump(back, 0)).toBe(back)
    expect(tourJump(back, -1)).toBe(back)
  })

  it('is done, closable and marked seen, only once the last step has been shown', () => {
    expect(tourDone(startTour, STEPS)).toBe(false)
    const second = tourNext(startTour, STEPS)
    expect(tourDone(second, STEPS)).toBe(false)
    const third = tourNext(second, STEPS)
    expect(tourDone(third, STEPS)).toBe(true)
    expect(tourDone(tourJump(third, 0), STEPS)).toBe(true)
  })
})
