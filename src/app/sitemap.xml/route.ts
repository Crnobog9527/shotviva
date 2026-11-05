import { sitemapIndexXml, xmlResponse } from '@/core/seo'
import { site } from '@/site/site.config'

// Sitemap index; child sitemaps are listed in core/seo/sitemap.ts (建站规格 R6).
export function GET() {
  return xmlResponse(sitemapIndexXml(site))
}
