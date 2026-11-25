import { TEMPLATE_REQUESTS_PATH } from '@/core/content/template-requests'
import { localizePath } from '@/core/i18n'

// /template-requests is the wishlist's public page, so it follows the wishlist's switch
// (ARCHITECTURE §15.6): while the wishlist is off the page stays up (its copy and the templates
// to use today) but is noindex and out of both sitemaps, and nothing links to it.
const ADDRESSES = new Set([TEMPLATE_REQUESTS_PATH, localizePath(TEMPLATE_REQUESTS_PATH, 'zh')])

export function isTemplateRequestsUrl(url: string): boolean {
  return ADDRESSES.has(new URL(url).pathname)
}

export function withWishlistPages(urls: readonly string[], wishlistOpen: boolean): string[] {
  return wishlistOpen ? [...urls] : urls.filter((url) => !isTemplateRequestsUrl(url))
}
