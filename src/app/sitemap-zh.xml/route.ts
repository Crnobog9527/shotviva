import { closedSeoFileResponse, urlsetXml, xmlResponse, zhSitemapUrls } from '@/core/seo'
import { pageGates } from '@/site/content'
import { site } from '@/site/site.config'

// The Chinese sitemap (建站规格 §6): only the indexable /zh pages of the Chinese keyword map.
// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0), like every other sitemap.
export function GET() {
  return closedSeoFileResponse() ?? xmlResponse(urlsetXml(zhSitemapUrls(site, pageGates)))
}
