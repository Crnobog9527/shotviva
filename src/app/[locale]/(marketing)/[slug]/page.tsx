import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Breadcrumbs, ContentPageView, pageGate, pagePath, type ContentPage } from '@/core/content'
import { isLocale, matchesPaths, type Locale } from '@/core/i18n'
import {
  JsonLdScript,
  breadcrumbListLd,
  faqPageLd,
  isGateOpen,
  pageMetadata,
  softwareApplicationLd,
} from '@/core/seo'
import { currentLocale } from '@/core/i18n/server'
import { contentPages, findContentPage, freeImagesLabel, homePage, isLinkEnabled } from '@/site/content'
import { site } from '@/site/site.config'

// Every inner SEO page renders through this one route (ARCHITECTURE §12).
// Fully static output: unknown slugs resolve before streaming, so they get a real 404
// instead of a streamed soft 404.
export const ensureStatic = 'navigation'

const isEnabled = (page: ContentPage) => isGateOpen(site, pagePath(page), [pageGate(page)])
// Chinese has only the pages listed in site.locales.zhPaths (ARCHITECTURE §17).
const isIn = (page: ContentPage, locale: Locale) => locale === 'en' || matchesPaths(pagePath(page), site.locales.zhPaths)

// Cache Components rejects an empty list; a site with every content page switched off
// prerenders one placeholder slug that resolves to 404 (findContentPage never matches it).
const NO_PAGES = [{ slug: '__no-content-pages__' }]

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = isLocale(params.locale) ? params.locale : 'en'
  const slugs = contentPages.filter((page) => isEnabled(page) && isIn(page, locale)).map((page) => ({ slug: page.slug }))
  return slugs.length > 0 ? slugs : NO_PAGES
}

async function load(params: Promise<{ slug: string }>): Promise<ContentPage> {
  const page = findContentPage((await params).slug)
  if (!page || !isEnabled(page) || !isIn(page, await currentLocale())) notFound()
  return page
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[slug]'>): Promise<Metadata> {
  const page = await load(params)
  return pageMetadata(site, { ...pageGate(page), title: page.title, description: page.description }, await currentLocale())
}

export default async function ContentRoute({ params }: PageProps<'/[locale]/[slug]'>) {
  const page = await load(params)
  const path = pagePath(page)
  const crumbs = [
    { name: homePage.label, path: '/' },
    { name: page.label, path },
  ]
  const meta = { path, title: page.title, description: page.description }
  const ld = [breadcrumbListLd(site, crumbs), faqPageLd(page.faq)]
  if (page.module) ld.push(softwareApplicationLd(site, meta, freeImagesLabel))
  return (
    <>
      <JsonLdScript data={ld} />
      <ContentPageView
        page={page}
        top={<Breadcrumbs crumbs={crumbs} />}
        isLinkEnabled={isLinkEnabled}
        relatedHeading="Related"
      />
    </>
  )
}
