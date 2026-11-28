import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'

import type { OwnerReport, ReportRow } from '../console/types'
import { Panel } from './parts'

// The owner's monthly performance table and CSV downloads (ARCHITECTURE §6.5, card E5), on the
// console. Server-rendered: the month picker is two plain links (?month=), nothing to hydrate.
// Spend is USD, pre-tax, net of refunds; no commission figure anywhere on this table.

const CELL = 'px-2 py-2 text-right tabular-nums'
const HEAD = 'px-2 py-2 text-right text-caption font-medium text-muted-foreground'

// An org without the affiliate program brings no customers, so its table is the month's usage,
// not performance (Owner 2026-11-28): its own title, hint, caption and footnote.
const COPY = {
  affiliate: { title: 'title', hint: 'hint', caption: 'caption', definition: 'definition' },
  usage: { title: 'titleNoAffiliate', hint: 'hintNoAffiliate', caption: 'captionNoAffiliate', definition: 'definitionNoAffiliate' },
} as const

export function PerformancePanel({ report, affiliate }: { report: OwnerReport | null; affiliate: boolean }) {
  const t = useTranslations('app.org.performance')
  const copy = COPY[affiliate ? 'affiliate' : 'usage']
  const format = useFormatter()
  const locale = useLocale()
  if (!report) {
    return (
      <Panel title={t(copy.title)} hint={t(copy.hint)}>
        <p role="status" className="text-label text-muted-foreground">{t('unavailable')}</p>
      </Panel>
    )
  }
  const money = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'USD' })
  const csv = (kind: 'members' | 'customers') => `/api/account/enterprise/report?month=${report.period}&kind=${kind}&locale=${locale === 'zh' ? 'zh' : 'en'}`
  const nav = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-button px-3 text-label font-semibold hover:bg-wash'
  const levels = [{ n: 1 as const, show: report.withAffiliate }, { n: 2 as const, show: report.withLevel2 }].filter((l) => l.show)
  const label = (row: ReportRow) => row.account ?? t('unknown')
  return (
    <Panel title={t(copy.title)} hint={t(copy.hint)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t('month')} className="flex items-center gap-1">
          {report.previous ? <Link href={`/account/enterprise?month=${report.previous}`} aria-label={t('previous')} className={nav}>‹</Link> : <span aria-hidden className={`${nav} opacity-30`}>‹</span>}
          <span className="min-w-24 text-center font-medium tabular-nums" aria-live="polite">{report.period}</span>
          {report.next ? <Link href={`/account/enterprise?month=${report.next}`} aria-label={t('next')} className={nav}>›</Link> : <span aria-hidden className={`${nav} opacity-30`}>›</span>}
        </nav>
        <div className="flex flex-wrap gap-2">
          <a href={csv('members')} download className="inline-flex min-h-11 items-center rounded-button bg-wash px-3 text-label font-semibold">{t('downloadMembers')}</a>
          {report.withAffiliate ? <a href={csv('customers')} download className="inline-flex min-h-11 items-center rounded-button bg-wash px-3 text-label font-semibold">{t('downloadCustomers')}</a> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-label">
          <caption className="sr-only">{t(copy.caption, { month: report.period })}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="px-2 py-2 text-left text-caption font-medium text-muted-foreground">{t('member')}</th>
              <th scope="col" className={HEAD}>{t('allocated')}</th>
              <th scope="col" className={HEAD}>{t('used')}</th>
              {levels.map((l) => (
                <ColumnGroup key={l.n} level={l.n} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {report.rows.map((row) => (
              <tr key={row.userId}>
                <th scope="row" className="max-w-52 px-2 [overflow-wrap:anywhere] py-2 text-left font-normal">
                  {label(row)}
                  {row.status === 'removed' ? <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-caption">{t('removed')}</span> : null}
                </th>
                <td className={CELL}>{format.number(row.allocated)}</td>
                <td className={CELL}>{format.number(row.used)}</td>
                {levels.map((l) => <LevelCells key={l.n} stats={l.n === 1 ? row.l1 : row.l2} money={money} />)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline font-semibold">
              <th scope="row" className="px-2 py-2 text-left">{t('total')}</th>
              <td className={CELL}>{format.number(report.totals.allocated)}</td>
              <td className={CELL}>{format.number(report.totals.used)}</td>
              {levels.map((l) => <LevelCells key={l.n} stats={l.n === 1 ? report.totals.l1 : report.totals.l2} money={money} />)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">{t(copy.definition)}</p>
    </Panel>
  )
}

function ColumnGroup({ level }: { level: 1 | 2 }) {
  const t = useTranslations('app.org.performance')
  return (
    <>
      <th scope="col" className={HEAD}>{t(level === 1 ? 'l1Signups' : 'l2Signups')}</th>
      <th scope="col" className={HEAD}>{t(level === 1 ? 'l1Paying' : 'l2Paying')}</th>
      <th scope="col" className={HEAD}>{t(level === 1 ? 'l1Paid' : 'l2Paid')}</th>
    </>
  )
}

function LevelCells({ stats, money }: { stats: { signups: number; paying: number; paidCents: number }; money: (cents: number) => string }) {
  const format = useFormatter()
  return (
    <>
      <td className={CELL}>{format.number(stats.signups)}</td>
      <td className={CELL}>{format.number(stats.paying)}</td>
      <td className={CELL}>{money(stats.paidCents)}</td>
    </>
  )
}
