import Link from 'next/link'
import type { ReactNode } from 'react'

import { MetricLabel } from '../analytics-ui/parts'
import { DASH, n } from '../analytics-ui/format'
import { averageOrder } from '../growth/funnel'
import type { GrowthPeriod } from '../growth/stats'
import { usd } from '../orders/money'
import { GROWTH_COPY as COPY } from './copy'
import { Section } from './section'

const C = COPY.revenue
type Row = { key: string; label: ReactNode; orders: number; net: number }

export function RevenueSection({ db }: { db: GrowthPeriod }) {
  const average = averageOrder(db)
  const headline = [
    { key: 'net', value: usd.format(db.money.net_usd) },
    { key: 'orders', value: n(db.orders.total) },
    { key: 'average', value: average === null ? DASH : usd.format(average) },
    { key: 'payers', value: n(db.payers) },
  ] as const
  const kinds = (['first', 'repeat', 'renewal'] as const).map((key) => ({
    key,
    label: <MetricLabel id={`growth-kind-${key}`} metric={C.kinds[key]} />,
    orders: db.orders[key],
    net: db.by_kind[key],
  }))
  const types = (['plan', 'pack'] as const).map((key) => ({ key, label: C.types[key], orders: db.by_type[key].orders, net: db.by_type[key].net_usd }))
  const channels = (['stripe', 'waffo'] as const).map((key) => ({ key, label: C.channels[key], orders: db.by_channel[key].orders, net: db.by_channel[key].net_usd }))
  return (
    <Section title={C.title} desc={C.desc}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        {headline.map((item) => (
          <div key={item.key} className="grid gap-0.5">
            <dt>
              <MetricLabel id={`growth-revenue-${item.key}`} metric={C.metrics[item.key]} className="text-sm text-muted-foreground" />
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 xl:grid-cols-3">
        <SplitTable title={C.kindTitle} rows={kinds} />
        <SplitTable title={C.typeTitle} rows={types} />
        <SplitTable title={C.channelTitle} rows={channels} />
      </div>
      <Issues db={db} />
      <Link href="/admin/orders" className="w-fit text-sm text-primary underline-offset-4 hover:underline">
        {C.ordersLink}
      </Link>
    </Section>
  )
}

function SplitTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <table className="w-full table-fixed text-sm" aria-label={title}>
      <caption className="pb-2 text-left font-semibold">{title}</caption>
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th scope="col" className="py-1.5 text-left font-normal">
            <span className="sr-only">{title}</span>
          </th>
          <th scope="col" className="w-12 py-1.5 text-right font-normal">{C.count}</th>
          <th scope="col" className="w-20 py-1.5 text-right font-normal">{C.amount}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-border last:border-0">
            <th scope="row" className="h-11 py-1 text-left font-normal">{row.label}</th>
            <td className="py-2 text-right tabular-nums">{n(row.orders)}</td>
            <td className="py-2 text-right tabular-nums">{usd.format(row.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Issues({ db }: { db: GrowthPeriod }) {
  const lines = [
    db.refunds.count ? C.refunds(n(db.refunds.count), usd.format(db.refunds.usd)) : null,
    db.disputes.count ? C.disputes(n(db.disputes.count), usd.format(db.disputes.usd)) : null,
  ].filter((line): line is string => line !== null)
  return (
    <div className="grid gap-1 text-sm">
      {lines.length ? lines.map((line) => <p key={line} className="text-destructive">{line}</p>) : <p className="text-muted-foreground">{C.noIssues}</p>}
      {db.orders.non_usd ? <p className="text-muted-foreground">{C.nonUsd(n(db.orders.non_usd))}</p> : null}
    </div>
  )
}
