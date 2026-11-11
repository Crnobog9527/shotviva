import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ContentPageView, pageGate, pagePath, type ContentPage } from '@/core/content'
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
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { toCatalogueTemplate } from '@/modules/image/marketing'
import { contentPagesIn, creditFacts, featuredSections, fillCredits, findContentPageIn, freeImagesIn, homePageIn, isLinkEnabled } from '@/site/content'
import { displayProducts } from '@/site/billing/display-products'
import { site } from '@/site/site.config'

import { HomeGeneratorSlot } from '../home-generator-slot'

// Every inner SEO page renders through this one route (ARCHITECTURE §12), in each language
// that has a text for it (site/content/localized.ts; Chinese only for the zh keyword map).
// The App Shell is static: unknown slugs resolve before streaming, so they get a real 404
// instead of a streamed soft 404. Only the generator's visitor half (the session) streams in
// at request time, behind its Suspense boundary.
export const ensureStatic = 'shell'

const isEnabled = (page: ContentPage) => isGateOpen(site, pagePath(page), [pageGate(page)])

// Cache Components rejects an empty list; a site with every content page switched off
// prerenders one placeholder slug that resolves to 404 (findContentPage never matches it).
const NO_PAGES = [{ slug: '__no-content-pages__' }]

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : 'en'
  const slugs = contentPagesIn(locale).filter(isEnabled).map((page) => ({ slug: page.slug }))
  return slugs.length > 0 ? slugs : NO_PAGES
}

// The page's copy with "from N credits" and the image counts filled from the live catalogue
// (建站规格 G3, G4).
async function load(params: Promise<{ slug: string }>) {
  const locale = await currentLocale()
  const slug = (await params).slug
  const [products, live] = await Promise.all([displayProducts(), cachedWebCatalogue(locale)])
  const found = findContentPageIn(slug, locale, products)
  if (!found || !isEnabled(found)) notFound()
  const facts = creditFacts(live)
  return { locale, live, products, page: fillCredits(found, facts), free: fillCredits(freeImagesIn(locale), facts) }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[slug]'>): Promise<Metadata> {
  const { locale, page } = await load(params)
  return pageMetadata(site, { ...pageGate(page), title: page.title, description: page.description }, locale)
}

export default async function ContentRoute({ params }: PageProps<'/[locale]/[slug]'>) {
  const { locale, live, products, page, free } = await load(params)
  const path = pagePath(page)
  const crumbs = [
    { name: homePageIn(locale).label, path: '/' },
    { name: page.label, path },
  ]
  const meta = { path: localizePath(path, locale), title: page.title, description: page.description }
  const ldCrumbs = crumbs.map((crumb) => ({ ...crumb, path: localizePath(crumb.path, locale) }))
  const ld = [breadcrumbListLd(site, ldCrumbs), faqPageLd(page.faq)]
  if (page.module) ld.push(softwareApplicationLd(site, meta, products, free))
  const catalogue = live.map(toCatalogueTemplate)
  // The page's own categories' featured templates; the generator opens on the first of them.
  const { defaultId, ...sections } = featuredSections(live, page.landing.templates?.categoryKeys)
  const generator = (
    <HomeGeneratorSlot templates={catalogue} defaultId={defaultId} homePath={localizePath(path, locale)} freeImages={free} />
  )
  return (
    <>
      <JsonLdScript data={ld} />
      <ContentPageView page={page} isLinkEnabled={isLinkEnabled} templates={sections} generator={generator} />
    </>
  )
}
