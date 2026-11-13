import { affiliateDefault } from '@/core/affiliate/defaults'
import { pricingV2 } from '@/core/public-env'
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
    // Owner 2026-11-07 (spec #175): auth emails come from mail@, an alias of support@.
    authEmail: 'mail@shotviva.com',
    launchYear: 2026,
    countries: ['United States'],
    // The 512×512 app icon (the signed-off "S." mark), SEO launch handbook G8.
    logoPath: '/icons/icon-512.png',
    // Filled once the X / Instagram / Product Hunt / LinkedIn handles are claimed (建站规格 §1).
    sameAs: [],
    // 1200×630: a phone photo and the same bag as a listing shot (illustrative), the wordmark.
    shareImage: {
      path: '/og/shotviva.jpg',
      width: 1200,
      height: 630,
      alt: 'Shotviva: a phone photo of a leather bag and the same bag as a white-background listing photo',
    },
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
      // SEO inner pages (T44). Indexable in Chinese with hreflang pairs since SEO patch v5 (Owner
      // 2026-11-12); see indexing.zhIndexablePaths.
      '/commercial-photography',
      '/ai-restaurant-menu',
      '/pricing',
      '/partners',
      '/partners/apply',
      '/partners/join',
      '/partners/terms',
      '/signup',
      '/login',
      '/reset',
      '/reset/update',
      '/generate',
      '/generate/[templateId]',
      '/photos',
      '/photos/[jobId]',
      // Dense-text posters (ARCHITECTURE §5.3), invite-only and noindex like every app page.
      '/posters',
      '/posters/[templateId]',
      '/account',
      // The Purchases list's receipt / invoice redirect (T80), so /zh links reach it.
      '/account/purchases/[paymentId]/[document]',
      '/wishlist',
      '/wishlist/new',
      '/wishlist/mine',
      '/connect/graylum',
      '/connect/graylum/authorize',
      // The checkout return page (T43, noindex like every app page).
      '/checkout',
      // The public gallery (T108), noindex in Chinese like the other inner pages.
      '/gallery',
      '/g/[jobId]',
    ],
    // Languages whose pages are not live yet but whose template covers can be prepared in the
    // admin ahead of launch (ARCHITECTURE §8.3, T87). Never shown on the site until launched.
    upcoming: ['ja'],
  },
  growth: { invite: { windowDays: 7, inviterRewardCap: 20 } },
  billing: {
    currency: 'usd',
    pricingVersion: pricingV2 ? 'v2' : undefined,
    freeCredits: pricingV2 ? 100 : 6,
    // The nine products, prices final (Owner 2026-11-05, ARCHITECTURE §6.2). Credits and days
    // also live in the products table for apply_purchase; tests/db/stripe-catalog.test.ts keeps
    // them equal. Stripe Prices are looked up by lookup_key, never stored here.
    products: [
      { id: 'starter_monthly', tier: 'starter', interval: 'month', credits: pricingV2 ? 1990 : 50, paidDays: 30, priceUsd: 19.9 },
      { id: 'starter_yearly', tier: 'starter', interval: 'year', credits: pricingV2 ? 23880 : 600, paidDays: 365, priceUsd: pricingV2 ? 191.04 : 191 },
      { id: 'pro_monthly', tier: 'pro', interval: 'month', credits: pricingV2 ? 6000 : 135, paidDays: 30, priceUsd: 49.9 },
      { id: 'pro_yearly', tier: 'pro', interval: 'year', credits: pricingV2 ? 72000 : 1620, paidDays: 365, priceUsd: pricingV2 ? 479.04 : 479 },
      { id: 'max_monthly', tier: 'max', interval: 'month', credits: pricingV2 ? 14000 : 280, paidDays: 30, priceUsd: 99 },
      { id: 'max_yearly', tier: 'max', interval: 'year', credits: pricingV2 ? 168000 : 3360, paidDays: 365, priceUsd: pricingV2 ? 891 : 713 },
      // Packs: anyone can buy them, they never change paid_until.
      { id: 'pack_s', tier: 'pack', interval: null, credits: pricingV2 ? 990 : 20, paidDays: null, priceUsd: 9.9 },
      { id: 'pack_m', tier: 'pack', interval: null, credits: pricingV2 ? 2490 : 55, paidDays: null, priceUsd: 24.9 },
      { id: 'pack_l', tier: 'pack', interval: null, credits: pricingV2 ? 4990 : 115, paidDays: null, priceUsd: 49.9 },
    ],
    channels: { primary: 'stripe', fallback: 'waffo' },
  },
  partners: {
    graylum: {
      // Graylum production (apex and www) and staging (the domain bound to Graylum's staging
      // Vercel project). The first entry is the "back to Graylum" link on the connect page.
      returnToHosts: ['graylum.com', 'www.graylum.com', 'auth-staging.graylum.com'],
      connectCallbackPath: '/api/connectors/shotviva/callback',
      // Not confirmed yet: must be the host(s) Graylum serves reference images from.
      imageHosts: ['graylum.com', 'staging.graylum.com'],
    },
  },
  // Shotviva has a public gallery; it stays closed until the Owner opens it in the admin (§9).
  gallery: { enabled: true },
  // Template wishlist (ARCHITECTURE §15): true means this site has the feature. Whether it is
  // open is the admin switch on /admin/features (system_settings wishlist_enabled, default
  // off, §15.6 T62); while closed the tab bar has three tabs and /wishlist, /api/wishlist and
  // /admin/requests 404. Preview deployments can also open it with FEATURE_WISHLIST_PREVIEW=on.
  features: { wishlist: true, affiliate: affiliateDefault },
  indexing: {
    // The two T44 landing pages are in the keyword map CSV (第一批 第 2 周). The four legal pages
    // are indexable too (Owner's SEO launch handbook, PATCH v3 G7, 2026-11-10): they answer 200,
    // and payment reviewers and AI answers cite them.
    indexablePaths: [
      '/',
      '/image-to-image-generator',
      '/commercial-photography',
      '/ai-restaurant-menu',
      '/pricing',
      '/terms',
      '/privacy',
      '/refund-policy',
      '/acceptable-use',
    ],
    // The Vercel project's production address (ARCHITECTURE §12.0).
    canonicalRedirectHosts: ['shotviva.vercel.app'],
    // seo资料/Shotviva 页面与主词映射（中文口径）.csv: the indexable /zh pages. The two vertical
    // pages joined on 2026-11-12 (SEO patch v5 item 1, Owner): each English vertical and its /zh
    // twin carry hreflang to each other.
    zhIndexablePaths: ['/', '/image-to-image-generator', '/commercial-photography', '/ai-restaurant-menu', '/pricing'],
  },
  // The home page's two bills (DESIGN §6.9 item 6), Owner 2026-11-06: styled product photos
  // $50–$350 per image (Shopify, "Product photography pricing", Jan 2026); white-background
  // packshots $15–$90 (ProShot Media, ProductPhotography.com, soona, Lars Miller Media price
  // pages, read 2026-11-06). Develop time is one round figure, "about 60 seconds", for every
  // quality (Owner 2026-11-06; preview measured 19–48 s across qualities). T44, sources read
  // 2026-11-06 (side-session-notes landing-fact-sources): a studio day $500–$3,000 (Shopify,
  // Jan 2026); a US half-day food shoot $400–$2,500 (PricingLink Apr 2025, Jobbers, FoodShot
  // Mar 2026), food stylist extra.
  marketing: {
    photographer: {
      styledShotUsd: { low: 50, high: 350 },
      packshotUsd: { low: 15, high: 90 },
      dayRateUsd: { low: 500, high: 3000 },
      foodHalfDayUsd: { low: 400, high: 2500 },
    },
    photoSecondsApprox: 60,
    examplePhotoCredits: { product: 74, menu: 74, poster: 45 },
  },
})
