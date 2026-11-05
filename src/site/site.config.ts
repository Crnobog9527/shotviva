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
    // The nine products, prices final (Owner 2026-11-05, ARCHITECTURE §6.2). Credits and days
    // also live in the products table for apply_purchase; tests/db/stripe-catalog.test.ts keeps
    // them equal. Stripe Prices are looked up by lookup_key, never stored here.
    products: [
      { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 50, paidDays: 30, priceUsd: 19.9 },
      { id: 'starter_yearly', tier: 'starter', interval: 'year', credits: 600, paidDays: 365, priceUsd: 139 },
      { id: 'pro_monthly', tier: 'pro', interval: 'month', credits: 135, paidDays: 30, priceUsd: 49.9 },
      { id: 'pro_yearly', tier: 'pro', interval: 'year', credits: 1620, paidDays: 365, priceUsd: 349 },
      { id: 'max_monthly', tier: 'max', interval: 'month', credits: 280, paidDays: 30, priceUsd: 99 },
      { id: 'max_yearly', tier: 'max', interval: 'year', credits: 3360, paidDays: 365, priceUsd: 699 },
      // Packs: anyone can buy them, they never change paid_until.
      { id: 'pack_s', tier: 'pack', interval: null, credits: 20, paidDays: null, priceUsd: 9.9 },
      { id: 'pack_m', tier: 'pack', interval: null, credits: 55, paidDays: null, priceUsd: 24.9 },
      { id: 'pack_l', tier: 'pack', interval: null, credits: 115, paidDays: null, priceUsd: 49.9 },
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
  // Template wishlist (ARCHITECTURE §15). Off until T12 ships the wall: when off the tab bar has
  // three tabs and /wishlist 404s.
  features: { wishlist: false },
  indexing: {
    indexablePaths: ['/', '/image-to-image-generator', '/pricing'],
  },
})
