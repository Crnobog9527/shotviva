import { describe, expect, it, vi } from 'vitest'

// The v2 catalogue (NEXT_PUBLIC_PRICING_CATALOG_VERSION=v2, the test site and production): the
// new-user gift the home page, the first-screen card and the template panel's sign-up bar all
// say is 200 credits by default (Owner 2026-11-27; 100 since O2, 2026-11-21); the admin setting changes it (2008). A local server without the flag says 6.
vi.mock('@/core/public-env', async (original) => ({ ...(await original<object>()), pricingV2: true }))

describe('the new-user gift line', () => {
  it('is 200 free credits in both languages by default with the v2 catalogue', async () => {
    const { freeImagesIn } = await import('./localized')
    const { FALLBACK_CREDITS, fillCredits } = await import('./credits')
    expect(fillCredits(freeImagesIn('zh'), FALLBACK_CREDITS)).toBe('200 个免费积分')
    expect(fillCredits(freeImagesIn('en'), FALLBACK_CREDITS)).toBe('200 free credits')
  })

  // 2008: the amount is the admin's setting; the page passes what it read.
  it('says the amount the page read from the setting', async () => {
    const { freeImagesIn } = await import('./localized')
    const { FALLBACK_CREDITS, fillCredits } = await import('./credits')
    expect(fillCredits(freeImagesIn('zh'), { ...FALLBACK_CREDITS, gift: 300 })).toBe('300 个免费积分')
    expect(fillCredits(freeImagesIn('en'), { ...FALLBACK_CREDITS, gift: 300 })).toBe('300 free credits')
  })
})
