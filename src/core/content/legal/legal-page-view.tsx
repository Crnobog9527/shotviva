import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'

import { formatLegalDate, type LegalNavItem, type LegalPage, type LegalSection } from './legal-page'
import { LegalBlockView } from './legal-text'
import { LegalTocSpy } from './legal-toc-spy'

// The reading layout of the four legal pages (design/comps-v3-b/legal.html, T45; English only,
// ARCHITECTURE §17): serif title,
// the date, the four pages as pills, a contents list (folded on phones, a sticky column from
// 1024px), then the text at a 68ch measure with numbered sections. Server-rendered semantic HTML,
// readable without JS; the only script marks the section being read in the contents.

function Contents({ sections, title }: { sections: LegalPage['sections']; title: string }) {
  const items = sections.map((section) => (
    <li key={section.id} className={section.plain ? 'plain' : undefined}>
      <a href={`#${section.id}`}>{section.heading}</a>
    </li>
  ))
  return (
    <>
      <details className="mk-legal-toc lg:hidden">
        <summary>
          {title}
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <ol>{items}</ol>
      </details>
      <nav aria-label={title} className="mk-legal-toc mk-legal-toc-side hidden lg:block">
        <p className="mk-legal-toc-title">{title}</p>
        <ol>{items}</ol>
      </nav>
    </>
  )
}

function SectionView({ section }: { section: LegalSection }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className={section.plain ? undefined : 'n'}>
      <h2 id={`${section.id}-heading`}>{section.heading}</h2>
      {section.blocks.map((block, i) => (
        <LegalBlockView key={i} block={block} />
      ))}
    </section>
  )
}

export function LegalPageView({ page, nav, email }: { page: LegalPage; nav: readonly LegalNavItem[]; email: string }) {
  const t = useTranslations('legal')
  return (
    <div className="mk-legal mk-w">
      <div className="mk-legal-head">
        <h1>{page.h1}</h1>
        <p className="mk-legal-upd">
          {t.rich('lastUpdated', { date: () => <time dateTime={page.lastUpdated}>{formatLegalDate(page.lastUpdated)}</time> })}
        </p>
        <nav aria-label={t('pagesLabel')} className="mk-legal-set">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.current ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <Contents sections={page.sections} title={t('contents')} />
      <article className="mk-legal-text">
        <div className="mk-legal-intro">
          {page.intro.map((block, i) => (
            <LegalBlockView key={i} block={block} />
          ))}
        </div>
        {page.sections.map((section) => (
          <SectionView key={section.id} section={section} />
        ))}
        <p className="mk-legal-end">{t.rich('questions', { mail: () => <a href={`mailto:${email}`}>{email}</a> })}</p>
      </article>
      <LegalTocSpy />
    </div>
  )
}
