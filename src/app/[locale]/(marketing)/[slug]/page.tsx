import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Breadcrumbs, ContentPageView, pageGate, pagePath, type ContentPage } from '@/core/content'
import { isLocale, localizePath, type Locale } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import {
  JsonLdScript,
  breadcrumbListLd,
  faqPageLd,
  isGateOpen,
  pageMetadata,
  softwareApplicationLd,
} from '@/core/seo'
import { contentPagesIn, findContentPageIn, freeImagesLabel, homePageIn, isLinkEnabled } from '@/site/content'
import { zhFreeImages } from '@/site/content/zh/offer'
import { site } from '@/site/site.config'

// Every inner SEO page renders through this one route (ARCHITECTURE §12), in each language
// that has a text for it (site/content/localized.ts; Chinese only for the zh keyword map).
// Fully static output: unknown slugs resolve before streaming, so they get a real 404
// instead of a streamed soft 404.
export const ensureStatic = 'navigation'

const isEnabled = (page: ContentPage) => isGateOpen(site, pagePath(page), [pageGate(page)])

// Cache Components rejects an empty list; a site with every content page switched off
// prerenders one placeholder slug that resolves to 404 (findContentPage never matches it).
const NO_PAGES = [{ slug: '__no-content-pages__' }]

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : 'en'
  const slugs = contentPagesIn(locale).filter(isEnabled).map((page) => ({ slug: page.slug }))
  return slugs.length > 0 ? slugs : NO_PAGES
}

async function load(params: Promise<{ slug: string }>) {
  const locale = await currentLocale()
  const page = findContentPageIn((await params).slug, locale)
  if (!page || !isEnabled(page)) notFound()
  return { locale, page }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[slug]'>): Promise<Metadata> {
  const { locale, page } = await load(params)
  return pageMetadata(site, { ...pageGate(page), title: page.title, description: page.description }, locale)
}

export default async function ContentRoute({ params }: PageProps<'/[locale]/[slug]'>) {
  const { locale, page } = await load(params)
  const path = pagePath(page)
  const crumbs = [
    { name: homePageIn(locale).label, path: '/' },
    { name: page.label, path },
  ]
  const meta = { path: localizePath(path, locale), title: page.title, description: page.description }
  const ldCrumbs = crumbs.map((crumb) => ({ ...crumb, path: localizePath(crumb.path, locale) }))
  const ld = [breadcrumbListLd(site, ldCrumbs), faqPageLd(page.faq)]
  if (page.module) ld.push(softwareApplicationLd(site, meta, locale === 'zh' ? zhFreeImages : freeImagesLabel))
  return (
    <>
      <JsonLdScript data={ld} />
      <ContentPageView page={page} top={<Breadcrumbs crumbs={crumbs} />} isLinkEnabled={isLinkEnabled} />
    </>
  )
}
