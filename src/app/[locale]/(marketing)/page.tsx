import type { Metadata } from 'next'

import { HomePageView } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { openingCovers } from '@/core/templates/cover-ratio'
import { toCatalogueTemplate } from '@/modules/image/marketing'
import { creditFacts, featuredSections, fillCredits, freeImagesIn, homePageIn, isLinkEnabled } from '@/site/content'
import { displayProducts } from '@/site/billing/display-products'
import { site } from '@/site/site.config'

import { isWishlistEnabled } from '@/core/wishlist'

import { HomeGeneratorSlot } from './home-generator-slot'
import { HomeWishCtaSlot } from './home-wish-cta-slot'

// The copy with "from N credits" and the image counts filled from the live catalogue (建站规格 G3, G4).
async function load() {
  const locale = await currentLocale()
  const [live, wishlistOpen, products] = await Promise.all([cachedWebCatalogue(locale), isWishlistEnabled(site), displayProducts()])
  const facts = creditFacts(live)
  const page = fillCredits(homePageIn(locale, products), facts)
  const meta = { path: '/', title: page.title, description: page.description }
  return { locale, live, products, page, wishlistOpen, free: fillCredits(freeImagesIn(locale), facts), meta }
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, meta } = await load()
  return pageMetadata(site, meta, locale)
}

// The home page in the request's language (ARCHITECTURE §17); JSON-LD in the same language.
// The live catalogue is a cached read (expired by every admin save, featured list included);
// only the generator's visitor half waits for the request.
export default async function HomePage() {
  const { locale, live, products, page, wishlistOpen, free, meta } = await load()
  const ldMeta = { ...meta, path: localizePath(meta.path, locale) }
  // LOCAL PREVIEW ONLY (not committed): three templates get a tall, a square and a wide cover.
  const shapes = [['tall', '/cases/poster-zh-after.webp', '/cases/poster-zh-before.webp'], ['square', '/home/wish-brunch-dark.webp', '/home/wish-lunch-light.webp'], ['wide', '/tmp-preview/room-wide.jpg', '/tmp-preview/room-phone-wide.jpg']] as const
  const shaped = live.filter((t) => t.coverAfterUrl).slice(0, 3).map((t) => t.id)
  const fakeLive = live.map((t) => { const i = shaped.indexOf(t.id); const sh = shapes[i]; return sh ? { ...t, name: `${t.name} · ${sh[0]}`, coverAfterUrl: sh[1], coverBeforeUrl: sh[2], featuredRank: i + 1 } : { ...t, featuredRank: null } })
  live.splice(0, live.length, ...fakeLive)
  const catalogue = live.map(toCatalogueTemplate)
  const { defaultId, ...sections } = featuredSections(live)
  const first = live.find((template) => template.id === defaultId)
  const measured = first ? await openingCovers({ ...first, coverAfterUrl: `http://localhost:3094${first.coverAfterUrl}`, coverBeforeUrl: `http://localhost:3094${first.coverBeforeUrl}` }) : null
  const initialCovers = measured && first ? { ...measured, after: measured.after ? { url: first.coverAfterUrl as string, ratio: measured.after.ratio } : null } : null
  return (
    <>
      <JsonLdScript data={[softwareApplicationLd(site, ldMeta, products, free), organizationLd(site), faqPageLd(page.faq)]} />
      <HomePageView
        page={page}
        brand={site.brand.name}
        isLinkEnabled={isLinkEnabled}
        templates={sections}
        generator={
          <HomeGeneratorSlot templates={catalogue} defaultId={defaultId} homePath={localizePath('/', locale)} freeImages={free} initialCovers={initialCovers} />
        }
        // Gone with the wishlist switch (cached read); signed out, sign-up returns to the wall.
        wishlistCta={wishlistOpen ? <HomeWishCtaSlot cta={page.wishlist.cta} next={localizePath('/wishlist', locale)} /> : null}
      />
    </>
  )
}
