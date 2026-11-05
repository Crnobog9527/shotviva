import type { ReactNode } from 'react'

import { CostTableSection } from './blocks/cost-table-section'
import { FactsSection } from './blocks/facts-section'
import { FaqSection } from './blocks/faq-section'
import { HeroSection } from './blocks/hero-section'
import { RelatedLinks } from './blocks/related-links'
import type { ContentPage } from './page-content'

type Props = {
  page: ContentPage
  // Rendered above the H1 (breadcrumbs on inner pages).
  top?: ReactNode
  // Rendered between the hero and the facts (the template grid on the home page).
  afterHero?: ReactNode
  relatedHeading: string
  // Hides links into switched-off modules (ARCHITECTURE §2: not in nav).
  isLinkEnabled?: (href: string) => boolean
}

// One renderer for every SEO page; the order follows ARCHITECTURE §13 / 建站规格 R10.
export function ContentPageView({ page, top, afterHero, relatedHeading, isLinkEnabled }: Props) {
  const enabled = isLinkEnabled ?? (() => true)
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      {top}
      <header>
        <h1>{page.h1}</h1>
        <p>{page.answerBlock}</p>
      </header>
      <HeroSection hero={page.hero} showCta={enabled(page.hero.cta.href)} />
      {afterHero}
      <FactsSection facts={page.facts} />
      <CostTableSection table={page.costTable} />
      <FaqSection faq={page.faq} />
      <RelatedLinks
        heading={relatedHeading}
        links={page.related.filter((link) => enabled(link.href))}
      />
    </article>
  )
}
