'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { PoolMonthView } from '../console/types'
import { Panel } from './parts'

// 「本月积分进出」 on the owner's workspace (ARCHITECTURE §6.5 企业推广积分池): this UTC month's
// movements of the paid pool and the promotion pool side by side, from org_pool_month.
export function PoolMonthPanel({ month }: { month: PoolMonthView | null }) {
  const t = useTranslations('app.org.poolMonth')
  const format = useFormatter()
  if (!month) return null
  // null: the row does not apply to that pool.
  const rows: [string, number | null, number | null][] = [
    [t('in'), month.paid.in, month.promo.granted],
    [t('allocated'), month.paid.allocated, month.promo.allocated],
    [t('reclaimed'), month.paid.reclaimed, month.promo.reclaimed],
    [t('clawedBack'), month.paid.clawedBack, null],
    [t('held'), null, month.promo.held],
    [t('expired'), null, month.promo.expired],
  ]
  const cell = (value: number | null) => (value === null ? '—' : format.number(value))
  return (
    <Panel title={t('title', { month: month.period })} hint={t('hint')}>
      <table className="w-full text-label tabular-nums">
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th className="py-1 text-left font-normal" scope="col"><span className="sr-only">{t('item')}</span></th>
            <th className="py-1 text-right font-normal" scope="col">{t('paid')}</th>
            <th className="py-1 text-right font-normal" scope="col">{t('promo')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map(([label, paid, promo]) => (
            <tr key={label}>
              <th scope="row" className="py-2 text-left font-normal">{label}</th>
              <td className="py-2 text-right">{cell(paid)}</td>
              <td className="py-2 text-right">{cell(promo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
