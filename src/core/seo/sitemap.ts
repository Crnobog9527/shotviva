import type { SiteConfig } from '../config'
import { indexablePaths, type PageGate } from './indexing'
import { absoluteUrl, siteOrigin } from './site-url'

// Sitemap index + child sitemaps (建站规格 R6). Only `pages` exists in v1; templates,
// blog and locale sitemaps are added here when those pages exist.
export const SITEMAP_NAMES = ['sitemap-pages'] as const

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

export function urlsetXml(urls: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n')
}

export function xmlResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
