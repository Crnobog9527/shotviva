import { defineSite } from '@/core/config'

export const site = defineSite({
  brand: {
    name: 'Shotviva',
    domain: 'shotviva.com',
    tagline: 'AI food & product photo studio',
    contactEmail: 'hello@shotviva.com',
    launchYear: 2026,
    countries: ['United States'],
    // Placeholder until T6 ships a real logo asset.
    logoPath: '/favicon.ico',
    // Filled once the X / Instagram / Product Hunt / LinkedIn handles are claimed (建站规格 §1).
    sameAs: [],
  },
  // A disabled module 404s, leaves the sitemap, nav and pricing (ARCHITECTURE §2).
  modules: { image: true, video: false },
  locales: { default: 'en', enabled: ['en'] },
  billing: {
    currency: 'usd',
    freeCredits: 3,
    // Structure fixed by ARCHITECTURE §6.2; prices wait for pricing-research.
    products: [
      { id: 'pass', credits: 30, paidDays: 30, priceUsd: 0 },
      { id: 'pack', credits: 120, paidDays: 365, priceUsd: 0 },
    ],
    channels: { primary: 'stripe', fallback: 'waffo' },
  },
  partners: { graylum: { returnToHosts: ['graylum.com', 'staging.graylum.com'] } },
  // 创作库规格 U9: no gallery pages for the first 8 weeks.
  gallery: { enabled: false },
  indexing: {
    indexablePaths: ['/', '/image-to-image-generator'],
  },
})
