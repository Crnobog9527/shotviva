// Shape of site/site.config.ts. Core reads the site only through this type,
// so a new site swaps site/ without touching core.
// T5 completes billing, partners and gallery.
export type ModuleId = 'image' | 'video'

export type SiteConfig = {
  brand: { name: string; domain: string; tagline: string }
  modules: Record<ModuleId, boolean>
  locales: { default: string; enabled: readonly string[] }
}

export function defineSite<const T extends SiteConfig>(config: T): T {
  return config
}
