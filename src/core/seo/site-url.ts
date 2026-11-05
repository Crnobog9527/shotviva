import type { SiteConfig } from '../config'

// Canonical origin comes from the brand domain, so canonicals and sitemaps always
// point at the one official site (建站规格 §1, R6), whatever host served the build.
export function siteOrigin(site: SiteConfig): string {
  return `https://${site.brand.domain}`
}

// Trailing slash is never used except for the root (建站规格 R4).
export function absoluteUrl(site: SiteConfig, path: string): string {
  return path === '/' ? `${siteOrigin(site)}/` : `${siteOrigin(site)}${path}`
}
