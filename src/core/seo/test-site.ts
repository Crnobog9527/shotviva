import { defineSite, type SiteConfig } from '../config'

// Fixture for core tests: a generic template site, not Shotviva.
export function testSite(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    ...defineSite({
      brand: {
        name: 'Example',
        domain: 'example.com',
        tagline: 'Example tagline',
        contactEmail: 'hi@example.com',
        launchYear: 2026,
        countries: ['United States'],
        logoPath: '/logo.png',
        sameAs: [],
      },
      modules: { image: true, video: false },
      locales: { default: 'en', enabled: ['en'] },
      billing: {
        currency: 'usd',
        freeCredits: 3,
        products: [
          { id: 'pass', credits: 30, paidDays: 30, priceUsd: 0 },
          { id: 'pack', credits: 120, paidDays: 365, priceUsd: 49 },
        ],
        channels: { primary: 'stripe', fallback: 'waffo' },
      },
      partners: { graylum: { returnToHosts: [], connectCallbackPath: '/callback', imageHosts: [] } },
      gallery: { enabled: false },
      indexing: { indexablePaths: ['/', '/image-to-image-generator', '/generate'] },
    }),
    ...overrides,
  }
}

export function withImageOff(site: SiteConfig): SiteConfig {
  return { ...site, modules: { ...site.modules, image: false } }
}
