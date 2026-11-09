import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it.each([
  [undefined, 6, 713, [50, 600, 135, 1620, 280, 3360, 20, 55, 115]],
  ['v2', 100, 891, [1990, 23880, 6000, 72000, 14000, 168000, 990, 2490, 4990]],
] as const)('keeps the complete build catalogue together for %s', async (version, free, maxAnnual, credits) => {
  vi.stubEnv('NEXT_PUBLIC_PRICING_CATALOG_VERSION', version)
  vi.resetModules()
  const { site } = await import('./site.config')
  const products = site.billing.products
  expect(site.billing.pricingVersion).toBe(version)
  expect(site.billing.freeCredits).toBe(free)
  expect(products.map((p) => p.credits)).toEqual(credits)
  expect(products.find((p) => p.id === 'max_yearly')?.priceUsd).toBe(maxAnnual)
  expect(site.growth.invite.inviteeCredits).toBe(6)
})
