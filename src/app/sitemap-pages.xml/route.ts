import { pageSitemapUrls, urlsetXml, xmlResponse } from '@/core/seo'
import { pageGates } from '@/site/content'
import { site } from '@/site/site.config'

// Indexable pages only; paths of disabled modules are dropped (AGENTS §7 item 5).
export function GET() {
  return xmlResponse(urlsetXml(pageSitemapUrls(site, pageGates)))
}
