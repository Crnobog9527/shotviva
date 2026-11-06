import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { CostTableSection } from './blocks/cost-table-section'
import { FactsSection } from './blocks/facts-section'
import { FaqSection } from './blocks/faq-section'
import { HeroSection } from './blocks/hero-section'
import { RelatedLinks } from './blocks/related-links'
import type { ContentPage, PageBasics } from './page-content'

type Props = {
  page: ContentPage
  // Rendered above the H1 (breadcrumbs on inner pages).
  top?: ReactNode
  // Hides links into switched-off modules (ARCHITECTURE §2: not in nav).
  isLinkEnabled?: (href: string) => boolean
}

export function PageHeader({ page }: { page: PageBasics }) {
  return (
    <header>
      <h1>{page.h1}</h1>
      {page.subtitle && <p>{page.subtitle}</p>}
      <p>{page.answerBlock}</p>
    </header>
  )
}

// One renderer for every inner SEO page; the order follows ARCHITECTURE §13 / 建站规格 R10.
export function ContentPageView({ page, top, isLinkEnabled }: Props) {
  const t = useTranslations('marketing')
  const enabled = isLinkEnabled ?? (() => true)
  const headings = page.headings ?? {}
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      {top}
      <PageHeader page={page} />
      <HeroSection hero={page.hero} showCta={enabled(page.hero.cta.href)} />
      <FactsSection facts={page.facts} heading={headings.facts ?? t('facts')} />
      <CostTableSection table={page.costTable} heading={headings.costTable ?? page.costTable.caption} />
      <FaqSection faq={page.faq} heading={headings.faq} isLinkEnabled={enabled} />
      <RelatedLinks
        heading={headings.related ?? t('related')}
        links={page.related.filter((link) => enabled(link.href))}
      />
    </article>
  )
}
