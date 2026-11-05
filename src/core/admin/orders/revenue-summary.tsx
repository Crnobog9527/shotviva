import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { StatCard } from '../shell/admin-blocks'
import { ORDERS_COPY as COPY } from './copy'
import { usd } from './money'
import type { RevenueStats, RevenueWindow } from './revenue'

const title = (window: RevenueWindow, days: number) => (window.key === 'period' ? COPY.windows.period(days) : COPY.windows[window.key])

export function RevenueCards({ stats }: { stats: RevenueStats }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.windows.map((window) => (
        <StatCard key={window.key} title={`${title(window, stats.days)} · ${COPY.revenue}`} value={usd.format(window.revenue_usd)} hint={COPY.purchases(window.purchases)} />
      ))}
    </div>
  )
}

export function RevenueByProduct({ stats }: { stats: RevenueStats }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{COPY.byProduct(stats.days)}</h2>
      {stats.by_product.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.noPurchases}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {[COPY.columns.product, COPY.columns.channel, COPY.columns.purchases, COPY.columns.revenue].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.by_product.map((row) => (
              <TableRow key={`${row.product_id}/${row.channel}`}>
                <TableCell className="font-mono text-xs">{row.product_id}</TableCell>
                <TableCell className="text-xs">{COPY.channels[row.channel]}</TableCell>
                <TableCell className="font-mono">{row.purchases}</TableCell>
                <TableCell className="font-mono">{usd.format(row.revenue_usd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
