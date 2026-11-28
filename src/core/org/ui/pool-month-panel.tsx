'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { PoolMonthView } from '../console/types'
import { Panel } from './parts'

// 「本月积分进出」 on the owner's workspace (ARCHITECTURE §6.5 企业推广积分池): this UTC month's
// movements of the paid pool and the promotion pool side by side, from org_pool_month. `promo`
// false (no promotion credits, promo-visibility.ts): the paid column only.
type Row = [string, number | null, number | null]

export function PoolMonthPanel({ month, promo }: { month: PoolMonthView | null; promo: boolean }) {
  const t = useTranslations('app.org.poolMonth')
  const format = useFormatter()
  if (!month) return null
  // null: the row does not apply to that pool.
  const all: Row[] = [
    [t('in'), month.paid.in, month.promo.granted],
    [t('allocated'), month.paid.allocated, month.promo.allocated],
    [t('reclaimed'), month.paid.reclaimed, month.promo.reclaimed],
    [t('clawedBack'), month.paid.clawedBack, null],
    [t('restored'), month.paid.restored, null],
    [t('held'), null, month.promo.held],
    [t('expired'), null, month.promo.expired],
  ]
  const rows = promo ? all : all.filter(([, paid]) => paid !== null)
  const cell = (value: number | null) => (value === null ? '—' : format.number(value))
  return (
    <Panel title={t('title', { month: month.period })} hint={t(promo ? 'hint' : 'hintPaidOnly')}>
      <table className="w-full text-label tabular-nums">
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th className="py-1 text-left font-normal" scope="col"><span className="sr-only">{t('item')}</span></th>
            <th className="py-1 text-right font-normal" scope="col">{t('paid')}</th>
            {promo ? <th className="py-1 text-right font-normal" scope="col">{t('promo')}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map(([label, paid, promoValue]) => (
            <tr key={label}>
              <th scope="row" className="py-2 text-left font-normal">{label}</th>
              <td className="py-2 text-right">{cell(paid)}</td>
              {promo ? <td className="py-2 text-right">{cell(promoValue)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
