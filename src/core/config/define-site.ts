import type { InviteConfig } from '../codes'
import type { Locale } from '../i18n/locales'

// Shape of site/site.config.ts. Core reads the site only through this type,
// so a new site swaps site/ without touching core (ARCHITECTURE §0, §2).
export type ModuleId = 'image' | 'video'

// Product ids are fixed: Stripe/Waffo mappings and analytics key on them (ARCHITECTURE §6.2).
// Memberships are '<tier>_<monthly|yearly>'; current_tier() (SQL) relies on that shape.
export const PRODUCT_IDS = [
  'starter_monthly',
  'starter_yearly',
  'pro_monthly',
  'pro_yearly',
  'max_monthly',
  'max_yearly',
  'pack_s',
  'pack_m',
  'pack_l',
] as const
export type ProductId = (typeof PRODUCT_IDS)[number]

export const MEMBERSHIP_TIERS = ['starter', 'pro', 'max'] as const
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number]
// 'pack' is the tier of the three credit packs (PostHog `tier`, §6.2).
export type ProductTier = MembershipTier | 'pack'
export type ProductInterval = 'month' | 'year'

export type PaymentChannel = 'stripe' | 'waffo'

type ProductBase = {
  id: ProductId
  // Paid credits granted per purchase (yearly: all twelve months at once).
  credits: number
  // 0 means "not decided yet"; pages must show a placeholder, never "$0".
  priceUsd: number
}

// A membership extends paid_until; a pack only adds paid credits (§6.1).
export type MembershipProduct = ProductBase & { tier: MembershipTier; interval: ProductInterval; paidDays: number }
export type PackProduct = ProductBase & { tier: 'pack'; interval: null; paidDays: null }
export type SiteProduct = MembershipProduct | PackProduct

// Postal address of the legal entity, as printed in the footer and the legal pages.
export type PostalAddress = {
  street: string
  locality: string
  // State or province code, e.g. 'WY'.
  region: string
  postalCode: string
  country: string
}

export type SiteBrand = {
  name: string
  domain: string
  tagline: string
  // The company that operates the site and is the party to its legal terms (LAUNCH §8).
  legalName: string
  // Where the company is registered, e.g. 'Wyoming, United States'.
  registeredIn: string
  address: PostalAddress
  // Entity facts for GEO trust signals (建站规格 G8). Also the address for support,
  // refunds and privacy requests on the legal pages.
  contactEmail: string
  // The From address of the auth emails (Supabase Auth over Resend, ARCHITECTURE §7). Only the
  // check-your-email views name it; contact links keep contactEmail.
  authEmail: string
  launchYear: number
  countries: readonly string[]
  logoPath: string
  sameAs: readonly string[]
}

// Graylum connector (ARCHITECTURE §14). Hosts are exact, lowercase, https-only matches.
export type PartnerSiteConfig = {
  // Where the connect flow and top-ups may send the user back to.
  returnToHosts: readonly string[]
  // Path of Graylum's connect callback; the one-time code is only ever sent there.
  connectCallbackPath: `/${string}`
  // Hosts the optional `image` URL of POST /api/partner/generate may point at (anti-SSRF).
  imageHosts: readonly string[]
}

export type SiteConfig = {
  brand: SiteBrand
  modules: Record<ModuleId, boolean>
  locales: {
    default: Locale
    enabled: readonly Locale[]
    // Logical paths (`/generate/[templateId]` style) of the pages that have a /zh version
    // (ARCHITECTURE §17). Every other /zh address 404s, emits no zh hreflang, shows no switch
    // banner, and the switcher points at /zh.
    zhPaths: readonly `/${string}`[]
    // Not launched yet: only the admin's cover tabs list them (T87). Short lowercase codes.
    upcoming?: readonly string[]
  }
  growth: { invite: InviteConfig }
  billing: {
    pricingVersion?: 'v2'
    currency: 'usd'
    freeCredits: number
    products: readonly SiteProduct[]
    // Which channel the UI prefers; the live on/off switch per channel is an env var (ARCHITECTURE §6.3).
    channels: { primary: PaymentChannel; fallback: PaymentChannel | null }
  }
  partners: { graylum: PartnerSiteConfig }
  gallery: { enabled: boolean }
  // Whether the site has a feature at all (ARCHITECTURE §15.6); a feature that has it may still
  // be switched off at runtime. Read through each feature's own helper (e.g. core/wishlist
  // isWishlistEnabled), never directly.
  features: { wishlist: boolean; affiliate: boolean }
  indexing: {
    // The only paths allowed into search. Every entry must exist in the keyword map CSV
    // (AGENTS §9); everything else renders noindex.
    indexablePaths: readonly `/${string}`[]
    // Production hosts that 308 to brand.domain once the deployment is configured for it
    // (ARCHITECTURE §12.0, core/seo canonicalHostRedirect).
    canonicalRedirectHosts: readonly string[]
    // The /zh pages allowed into search; each must be in the Chinese keyword map CSV
    // (AGENTS §9, 建站规格 §6.1) and in locales.zhPaths. Every other /zh page is noindex.
    zhIndexablePaths: readonly `/${string}`[]
  }
  // Numbers the marketing pages quote that are not our prices (DESIGN §6.9 item 6, G3): a
  // photographer's typical published rates and how long a photo takes. Owner confirms them
  // before launch; the sources are in design/SITE-PLAN.md.
  marketing: MarketingNumbers
}

export type UsdRange = { low: number; high: number }

export type MarketingNumbers = {
  photographer: {
    // Published per-image rates (Owner 2026-11-06). Retouching is not a separate figure: many
    // studios include it in the shot price, so a line of its own would count it twice.
    styledShotUsd: UsdRange
    // Plain white-background packshots.
    packshotUsd: UsdRange
    // A studio day for product photography.
    dayRateUsd: UsdRange
    // A half-day food shoot for a restaurant menu (the food stylist is billed apart).
    foodHalfDayUsd: UsdRange
  }
  // About how many seconds a photo takes, one round figure for every quality (Owner
  // 2026-11-06): no ranges or per-quality times, so a slower provider never breaks a promise.
  photoSecondsApprox: number
}

export function defineSite<const T extends SiteConfig>(config: T): T {
  return config
}
