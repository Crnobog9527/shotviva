import { closedSeoFileResponse, sitemapIndexXml, xmlResponse } from '@/core/seo'
import { site } from '@/site/site.config'

// Sitemap index; child sitemaps are listed in core/seo/sitemap.ts (建站规格 R6). 404 while the
// pre-launch switch is closed (ARCHITECTURE §12.0).
export function GET() {
  return closedSeoFileResponse() ?? xmlResponse(sitemapIndexXml(site))
}
