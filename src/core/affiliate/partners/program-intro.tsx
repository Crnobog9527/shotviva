import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import type { Locale } from '@/core/i18n'
import type { Translate } from '@/core/translate'
import { REFERRAL_COOKIE_DAYS } from '../referral'
import { money, percent } from './format'
import type { Rate } from './models'
import { readProgramTerms, type ProgramTerms } from './repository'

const rateOf = (rates: readonly Rate[], kind: Rate['product_kind']) => rates.find((r) => r.product_kind === kind)

// The program page: what it pays, how it works, then the one way in (`children`).
export async function ProgramIntro({ children }: { children?: ReactNode }) {
  const [t, locale, terms] = await Promise.all([getTranslations('affiliate'), currentLocale(), readProgramTerms()])
  return (
    <div className="af-program">
      <header className="af-hero">
        <h1>{t('heroTitle')}</h1>
        <p className="af-lede">{t('heroLede')}</p>
        {children ?? <p className="af-note" role="status">{t('closed')}</p>}
      </header>
      {terms && <TermsTable t={t} locale={locale} terms={terms} />}
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

function TermsTable({ t, locale, terms }: { t: Translate; locale: Locale; terms: ProgramTerms }) {
  const pack = rateOf(terms.rates, 'pack')
  const monthly = rateOf(terms.rates, 'monthly')
  const yearly = rateOf(terms.rates, 'yearly')
  const sameShort = pack && monthly && pack.l1_bp === monthly.l1_bp && pack.l2_bp === monthly.l2_bp
  const rows: [string, string, string?][] = []
  if (sameShort) rows.push([t('termsRow.short'), percent(locale, pack.l1_bp), t('termsRow.teamCut', { rate: percent(locale, pack.l2_bp) })])
  else {
    if (pack) rows.push([t('termsRow.pack'), percent(locale, pack.l1_bp), t('termsRow.teamCut', { rate: percent(locale, pack.l2_bp) })])
    if (monthly) rows.push([t('termsRow.monthly'), percent(locale, monthly.l1_bp), t('termsRow.teamCut', { rate: percent(locale, monthly.l2_bp) })])
  }
  if (yearly) rows.push([t('termsRow.yearly'), percent(locale, yearly.l1_bp), t('termsRow.teamCut', { rate: percent(locale, yearly.l2_bp) })])
  rows.push(
    [t('termsRow.cookie'), t('days', { count: REFERRAL_COOKIE_DAYS }), t('termsRow.cookieNote')],
    [t('termsRow.hold'), t('days', { count: terms.hold_days }), t('termsRow.holdNote')],
    [t('termsRow.payout'), money(locale, terms.payout_min_usd), t('termsRow.payoutNote', { day: terms.settlement_day })],
  )
  return (
    <section className="af-block" aria-labelledby="af-terms">
      <h2 id="af-terms">{t('numbersTitle')}</h2>
      <dl className="af-terms">
        {rows.map(([label, value, note]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span className="af-figure">{value}</span>
              {note && <span className="af-figure-note">{note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
