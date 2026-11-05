import Link from 'next/link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { ORDERS_COPY as COPY } from './copy'
import type { AdminSubscription } from './repository'
import { stripeDashboardUrl } from './source'

const COLUMNS = ['email', 'product', 'status', 'periodEnd', 'cancel'] as const

type Props = { subscriptions: AdminSubscription[]; counts: Record<string, number>; stripeLive: boolean }

export function SubscriptionsTable({ subscriptions, counts, stripeLive }: Props) {
  const summary = Object.entries(counts)
    .map(([status, n]) => `${COPY.subStatus[status] ?? status} ${n}`)
    .join(' · ')
  return (
    <div className="grid gap-2">
      {summary ? (
        <p className="text-sm text-muted-foreground">
          {COPY.subscriptionCounts}
          {summary}
        </p>
      ) : null}
      {subscriptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.noSubscriptions}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column}>{COPY.subColumns[column]}</TableHead>
              ))}
              <TableHead>{COPY.columns.link}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/admin/users/${row.userId}`} className="text-primary hover:underline">
                    {row.email ?? row.userId.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.productId}</TableCell>
                <TableCell className="text-xs">{COPY.subStatus[row.status] ?? row.status}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.currentPeriodEnd)}</TableCell>
                <TableCell className="text-xs">{row.cancelAtPeriodEnd ? COPY.yes : COPY.no}</TableCell>
                <TableCell>
                  <a href={stripeDashboardUrl(row.id, stripeLive)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                    {COPY.openInStripe}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
