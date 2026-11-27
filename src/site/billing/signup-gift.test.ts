import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/system-settings', () => ({ signupGiftCredits: async () => 777 }))

// 2008: with the v2 catalogue the site states the admin's amount; without it, the old 6.
describe('signupGiftCreditsForSite', () => {
  it('states the setting with the v2 catalogue, else the config amount', async () => {
    const { site } = await import('../site.config')
    const { signupGiftCreditsForSite } = await import('./signup-gift')
    const expected = site.billing.pricingVersion ? 350 : site.billing.freeCredits
    expect(await signupGiftCreditsForSite(async () => 350)).toBe(expected)
  })
})
