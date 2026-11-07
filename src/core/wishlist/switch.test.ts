import { describe, expect, it, vi } from 'vitest'

import { testSite } from '../seo/test-site'
import { decideWishlist, type SwitchEnv } from './switch'

// ARCHITECTURE §15.6 (T62): features.wishlist && (admin switch || preview override).

const without = testSite({ features: { wishlist: false } })
const withFeature = testSite({ features: { wishlist: true } })

const PROD: SwitchEnv = { VERCEL_ENV: 'production', FEATURE_WISHLIST_PREVIEW: 'off' }
const PREVIEW: SwitchEnv = { VERCEL_ENV: 'preview', FEATURE_WISHLIST_PREVIEW: 'off' }
const settings = (values: Record<string, unknown>) => vi.fn(async () => values)

describe('decideWishlist', () => {
  it('a site without the feature stays closed and never reads the switch', async () => {
    const on = settings({ wishlist_enabled: true })
    expect(await decideWishlist(without, PROD, on)).toBe(false)
    expect(await decideWishlist(without, { ...PREVIEW, FEATURE_WISHLIST_PREVIEW: 'on' }, on)).toBe(false)
    expect(on).not.toHaveBeenCalled()
  })

  it('follows the admin switch', async () => {
    expect(await decideWishlist(withFeature, PROD, settings({ wishlist_enabled: true }))).toBe(true)
    expect(await decideWishlist(withFeature, PROD, settings({ wishlist_enabled: false }))).toBe(false)
    expect(await decideWishlist(withFeature, PREVIEW, settings({ wishlist_enabled: true }))).toBe(true)
  })

  it('is closed when the switch was never saved or holds the wrong type', async () => {
    expect(await decideWishlist(withFeature, PROD, settings({}))).toBe(false)
    expect(await decideWishlist(withFeature, PROD, settings({ wishlist_enabled: 'true' }))).toBe(false)
  })

  it('is closed when the read failed (the cached read hands back no settings)', async () => {
    // settingsOrDefaults turns a failed read into {}; see core/system-settings/read.test.ts.
    expect(await decideWishlist(withFeature, PROD, settings({}))).toBe(false)
  })

  it('lets a preview or local deployment open it while the switch is off', async () => {
    const off = settings({ wishlist_enabled: false })
    for (const VERCEL_ENV of ['preview', 'development', undefined] as const) {
      expect(await decideWishlist(withFeature, { VERCEL_ENV, FEATURE_WISHLIST_PREVIEW: 'on' }, off)).toBe(true)
    }
    expect(off).not.toHaveBeenCalled()
  })

  it('never lets the override open it in production', async () => {
    const override = { VERCEL_ENV: 'production', FEATURE_WISHLIST_PREVIEW: 'on' } as const
    expect(await decideWishlist(withFeature, override, settings({ wishlist_enabled: false }))).toBe(false)
    expect(await decideWishlist(withFeature, override, settings({}))).toBe(false)
  })
})
