import type { ReactNode } from 'react'

import { CostBillsSection } from './blocks/cost-bills'
import { FaqSection } from './blocks/faq-section'
import { HomeHero } from './blocks/home-hero'
import { FreeOfferSection, HomeFacts, StepsSection } from './blocks/home-sections'
import { RelatedLinks } from './blocks/related-links'
import { ShootSection } from './blocks/shoot-section'
import { TemplateGrid, type FeaturedSections } from './blocks/template-grid'
import { WishlistSection } from './blocks/wishlist-section'
import type { HomePage } from './page-content'

type Props = {
  page: HomePage
  brand: string
  isLinkEnabled: (href: string) => boolean
  // The admin's featured templates by category, with their covers (T53).
  templates: FeaturedSections
  // The first-screen generator (modules/image, client), slotted under the hero pair.
  generator: ReactNode
  // The wishlist section's CTA (signed in or not, a request-time slot); null while the
  // wishlist is off, which drops the whole section.
  wishlistCta: ReactNode | null
}

// Home block order is fixed (ARCHITECTURE §13, 建站规格 §4): H1 + answer → hero + generator →
// the "full shoot" demo → the six H2s in order, with the two bills (block ③) after the free
// offer, as in the signed-off v3-b comp (design/comps-v3-b/home.html). While the wishlist is
// open, "Can't find your template?" follows the grid (Owner 2026-11-10); it is not one of the six.
export function HomePageView({ page, brand, isLinkEnabled, templates, generator, wishlistCta }: Props) {
  return (
    <article className="mk-home mk-w">
      <HomeHero page={page} generator={generator} />
      <ShootSection shoot={page.shoot} />
      <StepsSection steps={page.steps} />
      <TemplateGrid grid={page.templateGrid} sections={templates} isLinkEnabled={isLinkEnabled} />
      {wishlistCta ? <WishlistSection block={page.wishlist} cta={wishlistCta} /> : null}
      <HomeFacts facts={page.facts} heading={page.headings.facts} intro={page.factsIntro} />
      <FreeOfferSection offer={page.freeOffer} brand={brand} />
      <CostBillsSection bills={page.costBills} />
      <FaqSection faq={page.faq} heading={page.headings.faq} isLinkEnabled={isLinkEnabled} variant="accordion" />
      <RelatedLinks heading={page.headings.related} links={page.related.filter((link) => isLinkEnabled(link.href))} variant="cards" />
    </article>
  )
}
