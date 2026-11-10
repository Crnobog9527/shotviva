import { describe, expect, it } from 'vitest'

import { guideAction, isWishlistPath, showsTabDot } from './onboarding-rules'

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
