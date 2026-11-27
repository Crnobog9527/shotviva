import { closedSeoFileResponse, urlsetXml, xmlResponse, zhSitemapUrls } from '@/core/seo'
import { isWishlistEnabled } from '@/core/wishlist'
import { pageGates } from '@/site/content'
import { PAGE_LASTMOD } from '@/site/content/page-dates'
import { withWishlistPages } from '@/site/content/template-requests-gate'
import { site } from '@/site/site.config'

// The Chinese sitemap (建站规格 §6): only the indexable /zh pages of the Chinese keyword map.
// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0), like every other sitemap.
// /zh/template-requests only while the wishlist is open.
export async function GET() {
  const closed = await closedSeoFileResponse()
  if (closed) return closed
  const urls = withWishlistPages(zhSitemapUrls(site, pageGates), await isWishlistEnabled(site))
  return xmlResponse(urlsetXml(urls, PAGE_LASTMOD))
}
