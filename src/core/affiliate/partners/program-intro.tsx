import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'

// The program page: what it is, how it works, then the one way in (`children`).
export async function ProgramIntro({ children }: { children?: ReactNode }) {
  const t = await getTranslations('affiliate')
  return (
    <div className="af-program">
      <header className="af-hero">
        <h1>{t('heroTitle')}</h1>
        <p className="af-lede">{t('heroLede')}</p>
        {children ?? <p className="af-note" role="status">{t('closed')}</p>}
      </header>
      <section className="af-block" aria-labelledby="af-how">
        <h2 id="af-how">{t('howTitle')}</h2>
        <ol className="af-steps">
          {(['apply', 'share', 'earn'] as const).map((step) => (
            <li key={step}>
              <h3>{t('steps.' + step + '.title')}</h3>
              <p>{t('steps.' + step + '.body')}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="af-block" aria-labelledby="af-faq">
        <h2 id="af-faq">{t('faqTitle')}</h2>
        <dl className="af-faq">
          {(['who', 'review', 'counts', 'refunds', 'team'] as const).map((key) => (
            <div key={key}>
              <dt>{t('faq.' + key + '.q')}</dt>
              <dd>{t('faq.' + key + '.a')}</dd>
            </div>
          ))}
        </dl>
        <Link href="/partners/terms" className="af-link">{t('readTerms')}</Link>
      </section>
    </div>
  )
}
