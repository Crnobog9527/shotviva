// Shape of site/site.config.ts. Core reads the site only through this type,
// so a new site swaps site/ without touching core (ARCHITECTURE §0, §2).
export type ModuleId = 'image' | 'video'

// Product ids are fixed: Stripe/Waffo mappings and analytics key on them (ARCHITECTURE §6.2).
export type ProductId = 'pass' | 'pack'

export type PaymentChannel = 'stripe' | 'waffo'

export type SiteProduct = {
  id: ProductId
  credits: number
  paidDays: number
  // 0 means "not decided yet"; pages must show a placeholder, never "$0".
  priceUsd: number
}

export type SiteBrand = {
  name: string
  domain: string
  tagline: string
  // Entity facts for GEO trust signals (建站规格 G8).
  contactEmail: string
  launchYear: number
  countries: readonly string[]
  logoPath: string
  sameAs: readonly string[]
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
  partners: { graylum: { returnToHosts: readonly string[] } }
  gallery: { enabled: boolean }
  indexing: {
    // The only paths allowed into search. Every entry must exist in the keyword map CSV
    // (AGENTS §9); everything else renders noindex.
    indexablePaths: readonly `/${string}`[]
  }
}

export function defineSite<const T extends SiteConfig>(config: T): T {
  return config
}
