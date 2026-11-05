import { describe, expect, it } from 'vitest'

import { testSite } from '../seo/test-site'
import { wishlistSwitch } from '.'

const off = testSite({ features: { wishlist: false } })
const on = testSite({ features: { wishlist: true } })

describe('wishlistSwitch (ARCHITECTURE §15.6)', () => {
  it('follows the site config by default', () => {
    expect(wishlistSwitch(off, { VERCEL_ENV: 'preview', FEATURE_WISHLIST_PREVIEW: 'off' })).toBe(false)
    expect(wishlistSwitch(on, { VERCEL_ENV: 'production', FEATURE_WISHLIST_PREVIEW: 'off' })).toBe(true)
  })

  it('lets a preview or local deployment switch it on for validation', () => {
    expect(wishlistSwitch(off, { VERCEL_ENV: 'preview', FEATURE_WISHLIST_PREVIEW: 'on' })).toBe(true)
    expect(wishlistSwitch(off, { VERCEL_ENV: 'development', FEATURE_WISHLIST_PREVIEW: 'on' })).toBe(true)
    expect(wishlistSwitch(off, { VERCEL_ENV: undefined, FEATURE_WISHLIST_PREVIEW: 'on' })).toBe(true)
  })

  it('never lets the override turn it on in production', () => {
    expect(wishlistSwitch(off, { VERCEL_ENV: 'production', FEATURE_WISHLIST_PREVIEW: 'on' })).toBe(false)
  })
})
