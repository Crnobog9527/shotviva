import type { SiteConfig } from '../config'
import { indexablePaths, zhIndexablePaths, type PageGate } from './indexing'
import { absoluteUrl, siteOrigin } from './site-url'

// Sitemap index + child sitemaps (建站规格 R6): English pages, and one sitemap per extra
// language (§6). Templates and blog sitemaps are added here when those pages exist.
export const SITEMAP_NAMES = ['sitemap-pages', 'sitemap-zh'] as const

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function sitemapIndexXml(site: SiteConfig): string {
  const entries = SITEMAP_NAMES.map(
    (name) => `  <sitemap><loc>${escapeXml(`${siteOrigin(site)}/${name}.xml`)}</loc></sitemap>`,
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</sitemapindex>',
    '',
  ].join('\n')
}

export function pageSitemapUrls(site: SiteConfig, gates: readonly PageGate[] = []): string[] {
  return indexablePaths(site, gates).map((path) => absoluteUrl(site, path))
}

// Only the /zh pages of the Chinese keyword map (LAUNCH §7.6: three in v1).
export function zhSitemapUrls(site: SiteConfig, gates: readonly PageGate[] = []): string[] {
  return zhIndexablePaths(site, gates).map((path) => absoluteUrl(site, path))
}

// `lastmod`: the page's last content change by address path ("/", "/zh/pricing"), W3C date
// (YYYY-MM-DD), from the site's own table (site/content/page-dates.ts), never the deploy date.
// An address without one is written without <lastmod>.
export function urlsetXml(urls: readonly string[], lastmod: Readonly<Record<string, string>> = {}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => {
      const date = lastmod[new URL(url).pathname]
      return `  <url><loc>${escapeXml(url)}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`
    }),
    '</urlset>',
    '',
  ].join('\n')
}

export function xmlResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
