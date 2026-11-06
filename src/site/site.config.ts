import { defineSite } from '@/core/config'

import { SITE_DOMAIN } from './domain'

export const site = defineSite({
  brand: {
    name: 'Shotviva',
    domain: SITE_DOMAIN,
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
  // English + Simplified Chinese (Owner 2026-11-06). Chinese covers only the 14 core-path
  // pages of ARCHITECTURE §17; the wishlist and Graylum connect pages count with their steps.
  locales: {
    default: 'en',
    enabled: ['en', 'zh'],
    zhPaths: [
      '/',
      '/image-to-image-generator',
      '/pricing',
      '/signup',
      '/login',
      '/reset',
      '/reset/update',
      '/generate',
      '/generate/[templateId]',
      '/photos',
      '/photos/[jobId]',
      '/account',
      // Help & feedback (T27) belongs to the account page.
      '/account/help',
      '/account/help/new',
      '/account/help/[id]',
      '/wishlist',
      '/wishlist/new',
      '/wishlist/mine',
      '/connect/graylum',
      '/connect/graylum/authorize',
    ],
  },
  billing: {
    currency: 'usd',
    // = 3 free Standard images at 2 credits each; public copy says "3 free Standard images" (建站规格 G3).
    freeCredits: 6,
    // The nine products, prices final (Owner 2026-11-05, ARCHITECTURE §6.2). Credits and days
    // also live in the products table for apply_purchase; tests/db/stripe-catalog.test.ts keeps
    // them equal. Stripe Prices are looked up by lookup_key, never stored here.
    products: [
      { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 50, paidDays: 30, priceUsd: 19.9 },
      { id: 'starter_yearly', tier: 'starter', interval: 'year', credits: 600, paidDays: 365, priceUsd: 191 },
      { id: 'pro_monthly', tier: 'pro', interval: 'month', credits: 135, paidDays: 30, priceUsd: 49.9 },
      { id: 'pro_yearly', tier: 'pro', interval: 'year', credits: 1620, paidDays: 365, priceUsd: 479 },
      { id: 'max_monthly', tier: 'max', interval: 'month', credits: 280, paidDays: 30, priceUsd: 99 },
      { id: 'max_yearly', tier: 'max', interval: 'year', credits: 3360, paidDays: 365, priceUsd: 713 },
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
  // Template wishlist (ARCHITECTURE §15). When off, the tab bar has three tabs and /wishlist,
  // /api/wishlist and /admin/requests 404 (§15.6). Preview deployments can switch it on with
  // FEATURE_WISHLIST_PREVIEW=on for validation; production always follows this value.
  features: { wishlist: false },
  indexing: {
    indexablePaths: ['/', '/image-to-image-generator', '/pricing'],
    // The Vercel project's production address (ARCHITECTURE §12.0).
    canonicalRedirectHosts: ['shotviva.vercel.app'],
    // seo资料/Shotviva 页面与主词映射（中文口径）.csv: the three indexable /zh pages.
    zhIndexablePaths: ['/', '/image-to-image-generator', '/pricing'],
  },
  // The home page's two bills (DESIGN §6.9 item 6), Owner 2026-11-06: styled product photos
  // $50–$350 per image (Shopify, "Product photography pricing", Jan 2026); white-background
  // packshots $15–$90 (ProShot Media, ProductPhotography.com, soona, Lars Miller Media price
  // pages, read 2026-11-06). Seconds are Standard (preview jobs measured 19–33 s); LAUNCH §5
  // measures again before launch.
  marketing: {
    photographer: { styledShotUsd: { low: 50, high: 350 }, packshotUsd: { low: 15, high: 90 } },
    photoSeconds: { low: 20, high: 40 },
  },
})
