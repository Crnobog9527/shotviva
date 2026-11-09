import { defineSite, type SiteConfig } from '../config'

// Fixture for core tests: a generic template site, not Shotviva.
export function testSite(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    ...defineSite({
      brand: {
        name: 'Example',
        domain: 'example.com',
        tagline: 'Example tagline',
        legalName: 'Example LLC',
        registeredIn: 'Illinois, United States',
        address: { street: '1 Main St', locality: 'Springfield', region: 'IL', postalCode: '62701', country: 'United States' },
        contactEmail: 'hi@example.com',
        authEmail: 'mail@example.com',
        launchYear: 2026,
        countries: ['United States'],
        logoPath: '/logo.png',
        sameAs: [],
      },
      modules: { image: true, video: false },
      locales: { default: 'en', enabled: ['en', 'zh'], zhPaths: ['/', '/pricing', '/generate'] },
      growth: { invite: { inviteeCredits: 2, inviterCredits: 4, windowDays: 3, inviterRewardCap: 8 } },
      billing: {
        currency: 'usd',
        freeCredits: 3,
        products: [
          { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 30, paidDays: 30, priceUsd: 0 },
          { id: 'pack_s', tier: 'pack', interval: null, credits: 120, paidDays: null, priceUsd: 49 },
        ],
        channels: { primary: 'stripe', fallback: 'waffo' },
      },
      partners: { graylum: { returnToHosts: [], connectCallbackPath: '/callback', imageHosts: [] } },
      gallery: { enabled: false },
      features: { affiliate: false, wishlist: false },
      indexing: {
        indexablePaths: ['/', '/image-to-image-generator', '/generate'],
        zhIndexablePaths: ['/'],
        canonicalRedirectHosts: ['example.vercel.app'],
      },
      marketing: {
        photographer: {
      styledShotUsd: { low: 50, high: 350 },
      packshotUsd: { low: 15, high: 90 },
      dayRateUsd: { low: 500, high: 3000 },
      foodHalfDayUsd: { low: 400, high: 2500 },
    },
        photoSecondsApprox: 60,
      },
    }),
    ...overrides,
  }
}

export function withImageOff(site: SiteConfig): SiteConfig {
  return { ...site, modules: { ...site.modules, image: false } }
}
