import { describe, expect, it, vi } from 'vitest'

// The v2 catalogue (NEXT_PUBLIC_PRICING_CATALOG_VERSION=v2, the test site and production): the
// new-user gift the home page, the first-screen card and the template panel's sign-up bar all
// say is 100 credits (Owner 2026-11-21, O2). A local server without the flag says 6.
vi.mock('@/core/public-env', async (original) => ({ ...(await original<object>()), pricingV2: true }))

describe('the new-user gift line', () => {
  it('is 100 free credits in both languages with the v2 catalogue', async () => {
    const { freeImagesIn } = await import('./localized')
    expect(freeImagesIn('zh')).toBe('100 个免费积分')
    expect(freeImagesIn('en')).toBe('100 free credits')
  })
})
