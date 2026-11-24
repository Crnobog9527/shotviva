import type { Metadata } from 'next'

import { TemplateRequestsView } from '@/core/content/template-requests'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd, faqPageLd, notIndexedRobots, pageMetadata } from '@/core/seo'
import { cachedShippedTemplates, isWishlistEnabled } from '@/core/wishlist'
import { homePageIn, templateRequestsPageIn } from '@/site/content'
import { site } from '@/site/site.config'

import './template-requests.css'

// /template-requests and /zh/template-requests (Owner 2026-11-25): the wishlist's public page.
// Static like the other marketing pages: the copy and eight fictional example wishes from
// site/content, and the names of templates built from requests. No real request is ever shown
// here (Owner 2026-11-25): requests, votes and authors stay on the signed-in wishlist, which the
// page links into. Query strings never change what it
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
  const [open, shipped] = await Promise.all([isWishlistEnabled(site), cachedShippedTemplates(locale)])
  const crumbs = [
    { name: homePageIn(locale).label, path: localizePath('/', locale) },
    { name: text.label, path: localizePath(text.path, locale) },
  ]
  return (
    <>
      <JsonLdScript data={[breadcrumbListLd(site, crumbs), faqPageLd(text.faq)]} />
      <TemplateRequestsView text={text} shipped={open ? shipped : []} open={open} />
    </>
  )
}
