import type { Metadata } from 'next'

import { HomePageView } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { toCatalogueTemplate } from '@/modules/image'
import { featuredSections, freeImagesLabel, homePageIn, isLinkEnabled } from '@/site/content'
import { zhFreeImages } from '@/site/content/zh/offer'
import { site } from '@/site/site.config'

import { HomeGeneratorSlot } from './home-generator-slot'

async function load() {
  const locale = await currentLocale()
  const page = homePageIn(locale)
  return { locale, page, meta: { path: '/', title: page.title, description: page.description } }
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, meta } = await load()
  return pageMetadata(site, meta, locale)
}

// The home page in the request's language (ARCHITECTURE §17); JSON-LD in the same language.
// The live catalogue is a cached read (expired by every admin save, featured list included);
// only the generator's visitor half waits for the request.
export default async function HomePage() {
  const { locale, page, meta } = await load()
  const free = locale === 'zh' ? zhFreeImages : freeImagesLabel
  const ldMeta = { ...meta, path: localizePath(meta.path, locale) }
  const live = await cachedWebCatalogue(locale)
  const catalogue = live.map(toCatalogueTemplate)
  const { defaultId, ...sections } = featuredSections(page.templateGrid.categories, live)
  return (
    <>
      <JsonLdScript data={[softwareApplicationLd(site, ldMeta, free), organizationLd(site), faqPageLd(page.faq)]} />
      <HomePageView
        page={page}
        brand={site.brand.name}
        isLinkEnabled={isLinkEnabled}
        templates={sections}
        generator={
          <HomeGeneratorSlot templates={catalogue} defaultId={defaultId} homePath={localizePath('/', locale)} freeImages={free} />
        }
      />
    </>
  )
}
