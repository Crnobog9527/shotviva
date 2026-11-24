import type { ReactNode } from 'react'

import { CostBillsSection } from './blocks/cost-bills'
import { EditCasesSection } from './blocks/edit-cases'
import { FaqSection } from './blocks/faq-section'
import { HomeHero } from './blocks/home-hero'
import { FreeOfferSection, HomeFacts, StepsSection } from './blocks/home-sections'
import { RelatedLinks } from './blocks/related-links'
import { TemplateGrid, type FeaturedSections } from './blocks/template-grid'
import { TopicCards } from './blocks/topic-section'
import { WishlistLine } from './blocks/wishlist-section'
import { HeroStrip } from './blocks/hero-strip'
import type { HeroStripBlock, HomePage } from './page-content'

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
  // An A/B hero option's line under the direct answer (ARCHITECTURE §16.5).
  heroTagline?: string
  // An A/B hero option's further pairs, in a row under the first screen.
  heroStrip?: HeroStripBlock
}

// Home block order (Owner 2026-11-24: restaurants and hotels first, a shorter phone page): H1 +
// answer → hero + generator → the real dish pairs → text edits → the steps → the templates
// (food and spaces only, home-page.tsx) → one wishlist line → the facts → free offer → the two
// bills (block ③, which also carry the plans the JSON-LD offers read) → FAQ → the use-case topic
// H2 (SEO G5 / S4, kept, now at the end) → related links. The six H2s of 建站规格 §4 keep their
// order. The "full shoot" demo no longer shows on the home page (/commercial-photography has it).
export function HomePageView({ page, brand, isLinkEnabled, templates, generator, wishlistCta, heroTagline, heroStrip }: Props) {
  return (
    <article className="mk-home mk-w">
      <HomeHero page={page} generator={generator} tagline={heroTagline} />
      {heroStrip ? <HeroStrip strip={heroStrip} /> : null}
      {page.edits ? <EditCasesSection edits={page.edits} /> : null}
      <StepsSection steps={page.steps} />
      <TemplateGrid grid={page.templateGrid} sections={templates} isLinkEnabled={isLinkEnabled} />
      {wishlistCta ? <WishlistLine block={page.wishlist} cta={wishlistCta} /> : null}
      <HomeFacts facts={page.facts} heading={page.headings.facts} intro={page.factsIntro} />
      <FreeOfferSection offer={page.freeOffer} brand={brand} />
      <CostBillsSection bills={page.costBills} plans={page.plans} />
      <FaqSection faq={page.faq} heading={page.headings.faq} isLinkEnabled={isLinkEnabled} variant="accordion" />
      {page.topics ? <TopicCards topic={page.topics} isLinkEnabled={isLinkEnabled} /> : null}
      <RelatedLinks heading={page.headings.related} links={page.related.filter((link) => isLinkEnabled(link.href))} variant="cards" />
    </article>
  )
}
