import { FactsSection } from './blocks/facts-section'
import { FaqSection } from './blocks/faq-section'
import { HeroSection } from './blocks/hero-section'
import { FreeOfferSection, StepsSection } from './blocks/home-sections'
import { RelatedLinks } from './blocks/related-links'
import { TemplateGrid } from './blocks/template-grid'
import { PageHeader } from './content-page-view'
import type { HomePage } from './page-content'

type Props = { page: HomePage; isLinkEnabled: (href: string) => boolean }

// Home block order is fixed (ARCHITECTURE §13, DESIGN §4.1.1): H1 + answer → hero → six H2s
// in the 建站规格 §4 order. The first-screen generator (T8) slots in next to the hero.
export function HomePageView({ page, isLinkEnabled }: Props) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      <PageHeader page={page} />
      <div>
        <HeroSection hero={page.hero} showCta={isLinkEnabled(page.hero.cta.href)} />
        <p>{page.demoNote}</p>
      </div>
      <StepsSection steps={page.steps} />
      <TemplateGrid grid={page.templateGrid} isLinkEnabled={isLinkEnabled} />
      <FactsSection facts={page.facts} heading={page.headings.facts} intro={page.factsIntro} />
      <FreeOfferSection offer={page.freeOffer} costTable={page.costTable} />
      <FaqSection faq={page.faq} heading={page.headings.faq} isLinkEnabled={isLinkEnabled} />
      <RelatedLinks heading={page.headings.related} links={page.related.filter((link) => isLinkEnabled(link.href))} />
    </article>
  )
}
