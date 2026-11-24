import type { Metadata } from 'next'

import { TemplateRequestsView } from '@/core/content/template-requests'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd, faqPageLd, notIndexedRobots, pageMetadata } from '@/core/seo'
import { cachedPublicWall, isWishlistEnabled } from '@/core/wishlist'
import { homePageIn, templateRequestsPageIn } from '@/site/content'
import { site } from '@/site/site.config'

// /template-requests and /zh/template-requests (Owner 2026-11-25): the wishlist's public page.
// Static like the other marketing pages: the copy from site/content, the two lists from the
// shared wishlist cache (text only), refreshed by a vote or an admin review. Posting and voting
// stay on the signed-in wishlist, which the page links into. Query strings never change what it
// shows, and its canonical is always the bare address. While the wishlist is off it stays up,
// noindex and out of the sitemaps, without the links into the wishlist (ARCHITECTURE §15.6).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale()
  const text = templateRequestsPageIn(locale)
  const meta = pageMetadata(site, text, locale)
  return (await isWishlistEnabled(site)) ? meta : { ...meta, robots: notIndexedRobots() }
}

export default async function TemplateRequestsPage() {
  const locale = await currentLocale()
  const text = templateRequestsPageIn(locale)
  const [open, wall] = await Promise.all([isWishlistEnabled(site), cachedPublicWall(locale)])
  const crumbs = [
    { name: homePageIn(locale).label, path: localizePath('/', locale) },
    { name: text.label, path: localizePath(text.path, locale) },
  ]
  return (
    <>
      <JsonLdScript data={[breadcrumbListLd(site, crumbs), faqPageLd(text.faq)]} />
      <TemplateRequestsView text={text} wall={open ? wall : null} open={open} />
    </>
  )
}
