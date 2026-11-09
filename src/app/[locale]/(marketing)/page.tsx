import type { Metadata } from 'next'

import { HomePageView } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { toCatalogueTemplate } from '@/modules/image/marketing'
import { creditFacts, featuredSections, fillCredits, freeImagesIn, homePageIn, isLinkEnabled } from '@/site/content'
import { site } from '@/site/site.config'

import { HomeGeneratorSlot } from './home-generator-slot'

// The copy with "from N credits" and the image counts filled from the live catalogue (建站规格 G3, G4).
async function load() {
  const locale = await currentLocale()
  const live = await cachedWebCatalogue(locale)
  const facts = creditFacts(live)
  const page = fillCredits(homePageIn(locale), facts)
  return { locale, live, page, free: fillCredits(freeImagesIn(locale), facts), meta: { path: '/', title: page.title, description: page.description } }
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, meta } = await load()
  return pageMetadata(site, meta, locale)
}

// The home page in the request's language (ARCHITECTURE §17); JSON-LD in the same language.
// The live catalogue is a cached read (expired by every admin save, featured list included);
// only the generator's visitor half waits for the request.
export default async function HomePage() {
  const { locale, live, page, free, meta } = await load()
  const ldMeta = { ...meta, path: localizePath(meta.path, locale) }
  const catalogue = live.map(toCatalogueTemplate)
  const { defaultId, ...sections } = featuredSections(live)
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
