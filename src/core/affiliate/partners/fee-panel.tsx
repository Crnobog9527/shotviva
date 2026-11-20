import type { Locale } from '@/core/i18n'
import type { Translate } from '@/core/translate'
import { feeFormula, feeLabel, type FeeRule } from '../fees'
import { money, percent } from './format'
import type { PartnerFees } from './models'

type Props = { fees: PartnerFees; threshold: number; locale: Locale; t: Translate }

function formula(rule: FeeRule, locale: Locale, t: Translate) {
  return feeFormula(rule, {
    money: (cents) => money(locale, cents),
    percent: (bp) => percent(locale, bp),
    min: (amount) => t('fees.min', { amount }),
    max: (amount) => t('fees.max', { amount }),
  })
}

function scope(rule: FeeRule, t: Translate) {
  if (!rule.payout_methods) return t('fees.allMethods')
  return t('fees.onlyMethods', { methods: rule.payout_methods.map((m) => t('methods.' + m)).join(' / ') })
}

function Estimate({ fees, locale, t }: Omit<Props, 'threshold'>) {
  const usd = (cents: number) => money(locale, cents)
  return (
    <dl className="af-balance-facts">
      <div>
        <dt>{t('fees.totalFees')}</dt>
        <dd className="af-num">{usd(fees.estimate.fees)}</dd>
      </div>
      <div>
        <dt>{t('fees.net')}</dt>
        <dd className="af-num">{usd(fees.estimate.net)}</dd>
      </div>
    </dl>
  )
}

/** Payout fee rules in force and what the current balance would net after them. */
export function FeePanel({ fees, threshold, locale, t }: Props) {
  return (
    <section className="af-panel af-fees" aria-labelledby="af-fees">
      <h2 id="af-fees">{t('fees.title')}</h2>
      <p className="af-hint">{t('fees.intro', { threshold: money(locale, threshold) })}</p>
      {fees.rules.length ? (
        <ul className="af-fee-list">
          {fees.rules.map((rule) => (
            <li key={rule.id}>
              <strong>{feeLabel(rule, locale)}</strong>
              <span className="af-num">{formula(rule, locale, t)}</span>
              <span className="af-hint">{scope(rule, t)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('fees.none')}</p>
      )}
      <h3 className="af-label">{t('fees.estimateTitle', { balance: money(locale, fees.estimate.gross) })}</h3>
      <Estimate fees={fees} locale={locale} t={t} />
      <p className="af-hint">{fees.method ? t('fees.estimateNote') : t('fees.estimateNoMethod')}</p>
    </section>
  )
}
