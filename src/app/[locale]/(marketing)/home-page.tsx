import type { Metadata } from 'next'

import { ExperimentBeacon } from '@/core/analytics/browser'
import { HomePageView } from '@/core/content'
import { localizePath, type Locale } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { cachedFeaturedBundles } from '@/core/templates/cached-bundles'
import { cachedCaseStrip } from '@/core/templates/cached-case-strip'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { openingCovers } from '@/core/templates/cover-ratio'
import { cachedPublicSeries } from '@/core/templates/public-series'
import { homePanelTemplates } from '@/modules/image/marketing'
import { displayProducts } from '@/site/billing/display-products'
import { HOME_CATEGORIES, bundleSection, creditFacts, featuredSections, fillCredits, freeImagesIn, homeCaseStrip, homePageIn, isLinkEnabled, offersShownIn } from '@/site/content'
import { HERO_DEFAULT_OPTION, heroOptionContent } from '@/site/experiments'
import { site } from '@/site/site.config'

import { HomeGeneratorSlot } from './home-generator-slot'
import { optionPictures } from './home-hero-live'


// The home page, shared by `/` (today's hero) and the A/B hero options the proxy rewrites `/` to
// (x/hero/[option], ARCHITECTURE §16.5). An option swaps only the hero pictures, adds one line and
// opens the generator on its template; title, H1, copy, JSON-LD and canonical stay those of `/`.

// The copy with "from N credits" and the image counts filled from the live catalogue (建站规格 G3, G4).
async function load() {
  const locale = await currentLocale()
  const [live, series, products, bundles, cases] = await Promise.all([
    cachedWebCatalogue(locale), cachedPublicSeries(locale), displayProducts(), cachedFeaturedBundles(locale), cachedCaseStrip(locale),
  ])
  const facts = creditFacts(live)
  const page = fillCredits(homePageIn(locale, products), facts)
  const meta = { path: '/', title: page.title, description: page.description }
  return { locale, live, series, products, bundles, cases, page, free: fillCredits(freeImagesIn(locale), facts), meta }
}

export async function homeMetadata(): Promise<Metadata> {
  const { locale, meta } = await load()
  return pageMetadata(site, meta, locale)
}

// Restaurants and hotels lead (Owner 2026-11-24): `/` is the registry's default option (food), its
// pictures, line and strip, and the generator keeps the admin's first featured template (a hotel
// one today), so the first screen shows a dish above and a hotel below. Another option's page
// (/x/hero/…) shows its own pictures and opens the generator on its template; `tote` has none
// here, so it shows the page content's own hero.
function heroFor(heroOption: string | undefined, locale: Locale, live: readonly { id: string }[], featuredId: string | null) {
  const option = heroOptionContent(heroOption ?? HERO_DEFAULT_OPTION, locale)
  const opens = heroOption ? option?.generatorTemplate : undefined
  return { option, defaultId: opens && live.some((template) => template.id === opens) ? opens : featuredId }
}

// The live catalogue is a cached read (expired by every admin save, featured list included);
// only the generator's visitor half waits for the request.
export async function HomeContent({ heroOption }: { heroOption?: string }) {
  const { locale, live, series, products, bundles, cases, page, free, meta } = await load()
  const ldMeta = { ...meta, path: localizePath(meta.path, locale) }
  // Series show as one card each, in the admin's order (T102, Owner 2026-11-12). Only food and
  // spaces (hotels) on the home page (Owner 2026-11-24); the generator still offers every template.
  const { defaultId: featuredId, ...featured } = featuredSections(live, HOME_CATEGORIES, series)
  // 精选组合 (Owner 2026-11-25): their own group, ahead of the categories.
  const bundled = bundleSection(live, bundles, locale)
  const sections = { categories: bundled.category ? [bundled.category, ...featured.categories] : featured.categories, media: { ...featured.media, ...bundled.media } }
  const { option, defaultId } = heroFor(heroOption, locale, live, featuredId)
  const { templates, opening } = homePanelTemplates(live, defaultId, bundles.flatMap((bundle) => bundle.memberIds))
  const [initialCovers, optionHero] = await Promise.all([openingCovers(opening), optionPictures(option, live)])
  const shown = optionHero ? { ...page, hero: { ...page.hero, ...optionHero } } : page
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
        // 「更多真实案例」: the admin's picks for this language, else the option's built-in row.
        heroStrip={homeCaseStrip(option?.strip, cases, live, locale)}
        generator={
          <HomeGeneratorSlot templates={templates} catalogue={{ locale }} defaultId={opening?.id ?? null} homePath={localizePath('/', locale)} freeImages={free} initialCovers={initialCovers} />
        }
      />
    </>
  )
}
