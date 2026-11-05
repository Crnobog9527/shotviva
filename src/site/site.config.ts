import { defineSite } from '@/core/config'

export const site = defineSite({
  brand: {
    name: 'Shotviva',
    domain: 'shotviva.com',
    tagline: 'AI photo studio',
    // Owner 2026-11-05 (T19). Footer and legal pages read these, never a literal.
    legalName: 'Grayscale Luminary LLC',
    registeredIn: 'Wyoming, United States',
    address: { street: '75 E 3rd St', locality: 'Sheridan', region: 'WY', postalCode: '82801', country: 'United States' },
    contactEmail: 'support@shotviva.com',
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
    // = 3 free Standard images at 2 credits each; public copy says "3 free Standard images" (建站规格 G3).
    freeCredits: 6,
    // Structure fixed by ARCHITECTURE §6.2; prices wait for pricing-research.
    products: [
      { id: 'pass', credits: 30, paidDays: 30, priceUsd: 0 },
      { id: 'pack', credits: 120, paidDays: 365, priceUsd: 0 },
    ],
    channels: { primary: 'stripe', fallback: 'waffo' },
  },
  partners: {
    graylum: {
      // Graylum production and staging (the domain bound to Graylum's staging Vercel project).
      returnToHosts: ['graylum.com', 'auth-staging.graylum.com'],
      connectCallbackPath: '/api/connectors/shotviva/callback',
      // Not confirmed yet: must be the host(s) Graylum serves reference images from.
      imageHosts: ['graylum.com', 'staging.graylum.com'],
    },
  },
  // 创作库规格 U9: no gallery pages for the first 8 weeks.
  gallery: { enabled: false },
  indexing: {
    indexablePaths: ['/', '/image-to-image-generator'],
  },
})
