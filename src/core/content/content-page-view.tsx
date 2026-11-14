import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { CompareSection } from './blocks/compare-section'
import { CostBillsSection } from './blocks/cost-bills'
import { EditCasesSection } from './blocks/edit-cases'
import { FaqSection } from './blocks/faq-section'
import { HomeHero } from './blocks/home-hero'
import { FactCards } from './blocks/home-sections'
import { RelatedLinks } from './blocks/related-links'
import { ShootSection } from './blocks/shoot-section'
import { TemplateGrid, type FeaturedSections } from './blocks/template-grid'
import type { ContentPage } from './page-content'

type Props = {
  page: ContentPage
  // Hides links into switched-off modules (ARCHITECTURE §2: not in nav).
  isLinkEnabled: (href: string) => boolean
  // The featured templates in this page's categories, with their covers and prices (T53).
  templates: FeaturedSections
  // The first-screen generator (modules/image), opening on the page's template.
  generator: ReactNode
}

// One skeleton for every SEO landing page (design/comps-v3-b/landing.html, ARCHITECTURE §12,
// 建站规格 R10): hero + direct answer + generator → the optional "full shoot" demo → the optional
// edit cases → the page's template categories → facts → the two bills → the optional comparison
// table → FAQ → related pages.
// No visible breadcrumbs (DESIGN §8); the BreadcrumbList JSON-LD stays.
export function ContentPageView({ page, isLinkEnabled, templates, generator }: Props) {
  const t = useTranslations('marketing')
  const headings = page.headings ?? {}
  const { landing } = page
  return (
    <article className="mk-home mk-w">
      <HomeHero page={page} generator={generator} />
      {landing.shoot ? <ShootSection shoot={landing.shoot} /> : null}
      {landing.edits ? <EditCasesSection edits={landing.edits} /> : null}
      {landing.templates ? <TemplateGrid grid={landing.templates} sections={templates} isLinkEnabled={isLinkEnabled} /> : null}
      <FactCards facts={page.facts} heading={headings.facts ?? t('facts')} note={landing.factsNote} />
      <CostBillsSection bills={page.costBills} />
      {landing.compare ? <CompareSection compare={landing.compare} /> : null}
      <FaqSection faq={page.faq} heading={headings.faq} isLinkEnabled={isLinkEnabled} variant="accordion" />
      <RelatedLinks heading={headings.related ?? t('related')} links={page.related.filter((link) => isLinkEnabled(link.href))} variant="cards" />
    </article>
  )
}
