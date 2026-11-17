import type { Metadata } from 'next'

import { ExperimentBeacon } from '@/core/analytics/browser'
import { HomePageView } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { isWishlistEnabled } from '@/core/wishlist'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { cachedCatalogueIndex } from '@/core/templates/cached-taxonomy'
import { openingCovers } from '@/core/templates/cover-ratio'
import { cachedPublicSeries } from '@/core/templates/public-series'
import { pickerBrowse, toCatalogueTemplate } from '@/modules/image/marketing'
import { displayProducts } from '@/site/billing/display-products'
import { creditFacts, featuredSections, fillCredits, freeImagesIn, homePageIn, isLinkEnabled, offersShownIn } from '@/site/content'
import { generatorPickFor, heroOptionContent, orderForHero } from '@/site/experiments'
import { site } from '@/site/site.config'

import { HomeGeneratorSlot } from './home-generator-slot'
import { HomeWishCtaSlot } from './home-wish-cta-slot'

// The home page, shared by `/` (today's hero) and the A/B hero options the proxy rewrites `/` to
// (x/hero/[option], ARCHITECTURE §16.5). An option swaps only the hero pictures, adds one line and
// opens the generator on its template; title, H1, copy, JSON-LD and canonical stay those of `/`.

// The copy with "from N credits" and the image counts filled from the live catalogue (建站规格 G3, G4).
async function load() {
  const locale = await currentLocale()
  const [live, series, index, wishlistOpen, products] = await Promise.all([
    cachedWebCatalogue(locale), cachedPublicSeries(locale), cachedCatalogueIndex(locale), isWishlistEnabled(site), displayProducts(),
  ])
  const facts = creditFacts(live)
  const page = fillCredits(homePageIn(locale, products), facts)
  const meta = { path: '/', title: page.title, description: page.description }
  return { locale, live, series, index, products, page, wishlistOpen, free: fillCredits(freeImagesIn(locale), facts), meta }
}

export async function homeMetadata(): Promise<Metadata> {
  const { locale, meta } = await load()
  return pageMetadata(site, meta, locale)
}

// The live catalogue is a cached read (expired by every admin save, featured list included);
// only the generator's visitor half waits for the request.
export async function HomeContent({ heroOption }: { heroOption?: string }) {
  const { locale, live, series, index, products, page, wishlistOpen, free, meta } = await load()
  const option = heroOption ? heroOptionContent(heroOption, locale) : null
  const ldMeta = { ...meta, path: localizePath(meta.path, locale) }
  // The option's own templates first in the generator (generator-order.ts), the rest as today.
  const { ordered: catalogue, first } = orderForHero(live.map(toCatalogueTemplate), generatorPickFor(heroOption))
  // Series show as one card each, in the admin's order (T102, Owner 2026-11-12).
  const { defaultId: featuredId, ...sections } = featuredSections(live, undefined, series)
  const defaultId = first ?? featuredId
  const initialCovers = await openingCovers(live.find((template) => template.id === defaultId))
  const shown = option ? { ...page, hero: { ...page.hero, ...option.hero } } : page
  return (
    <>
      {/* Offers: the plans this page shows (the three monthly cards), never the whole catalog (03-S2). */}
      <JsonLdScript data={[softwareApplicationLd(site, ldMeta, offersShownIn(page, products), free), organizationLd(site), faqPageLd(page.faq)]} />
      {/* Reports the visitor's hero experiment group to analytics (ARCHITECTURE §16.5). */}
      <ExperimentBeacon />
      <HomePageView
        page={shown}
        brand={site.brand.name}
        isLinkEnabled={isLinkEnabled}
        templates={sections}
        heroTagline={option?.tagline}
        heroStrip={option?.strip}
        generator={
          <HomeGeneratorSlot templates={catalogue} browse={pickerBrowse(index, catalogue, locale === 'zh')} defaultId={defaultId} homePath={localizePath('/', locale)} freeImages={free} initialCovers={initialCovers} />
        }
        // Gone with the wishlist switch (cached read); signed out, sign-up returns to the wall.
        wishlistCta={wishlistOpen ? <HomeWishCtaSlot cta={page.wishlist.cta} next={localizePath('/wishlist', locale)} /> : null}
      />
    </>
  )
}
