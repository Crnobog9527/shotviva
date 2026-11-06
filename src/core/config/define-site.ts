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
  locales: { default: string; enabled: readonly string[] }
  billing: {
    currency: 'usd'
    freeCredits: number
    products: readonly SiteProduct[]
    // Which channel the UI prefers; the live on/off switch per channel is an env var (ARCHITECTURE §6.3).
    channels: { primary: PaymentChannel; fallback: PaymentChannel | null }
  }
  partners: { graylum: PartnerSiteConfig }
  gallery: { enabled: boolean }
  // Build-time feature switches (ARCHITECTURE §15.6). Read through each feature's own helper
  // (e.g. core/wishlist isWishlistEnabled), never directly.
  features: { wishlist: boolean }
  indexing: {
    // The only paths allowed into search. Every entry must exist in the keyword map CSV
    // (AGENTS §9); everything else renders noindex.
    indexablePaths: readonly `/${string}`[]
    // Production hosts that 308 to brand.domain once the deployment is configured for it
    // (ARCHITECTURE §12.0, core/seo canonicalHostRedirect).
    canonicalRedirectHosts: readonly string[]
  }
}

export function defineSite<const T extends SiteConfig>(config: T): T {
  return config
}
