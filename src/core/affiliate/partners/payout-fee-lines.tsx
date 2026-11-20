import type { Locale } from '@/core/i18n'
import type { Translate } from '@/core/translate'
import { feeLabel, type FeeQuote } from '../fees'
import { date, money } from './format'

type Item = { id: string | number; period: string; fees: FeeQuote | null }


/** Each deduction of each statement on this page, under the payouts table. */
export function FeeLines({ items, locale, t }: { items: Item[]; locale: Locale; t: Translate }) {
  const withLines = items.map((r) => ({ ...r, lines: r.fees?.lines ?? [] })).filter((r) => r.lines.length)
  if (!withLines.length) return null
  return (
    <div className="af-fee-lines">
      <h3 className="af-label">{t('fees.breakdown')}</h3>
      <ul>
        {withLines.map((r) => (
          <li key={r.id}>
            {date(locale, r.period)}
            {': '}
            {r.lines.map((line) => feeLabel(line, locale) + ' ' + money(locale, line.amount)).join(' · ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
