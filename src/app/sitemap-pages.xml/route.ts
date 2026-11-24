import { closedSeoFileResponse, pageSitemapUrls, urlsetXml, xmlResponse } from '@/core/seo'
import { isWishlistEnabled } from '@/core/wishlist'
import { pageGates } from '@/site/content'
import { PAGE_LASTMOD } from '@/site/content/page-dates'
import { withWishlistPages } from '@/site/content/template-requests-gate'
import { site } from '@/site/site.config'

// Indexable pages only; paths of disabled modules are dropped (AGENTS §7 item 5), and
// /template-requests while the wishlist is off. 404 while the pre-launch switch is closed
// (ARCHITECTURE §12.0).
export async function GET() {
  const closed = await closedSeoFileResponse()
  if (closed) return closed
  const urls = withWishlistPages(pageSitemapUrls(site, pageGates), await isWishlistEnabled(site))
  return xmlResponse(urlsetXml(urls, PAGE_LASTMOD))
}
