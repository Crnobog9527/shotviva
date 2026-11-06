import { closedSeoFileResponse, pageSitemapUrls, urlsetXml, xmlResponse } from '@/core/seo'
import { pageGates } from '@/site/content'
import { site } from '@/site/site.config'

// Indexable pages only; paths of disabled modules are dropped (AGENTS §7 item 5). 404 while the
// pre-launch switch is closed (ARCHITECTURE §12.0).
export async function GET() {
  return (await closedSeoFileResponse()) ?? xmlResponse(urlsetXml(pageSitemapUrls(site, pageGates)))
}
