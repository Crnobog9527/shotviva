import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { ORDERS_COPY as COPY } from './copy'
import { usd } from './money'
import type { AdminPurchase } from './repository'
import { stripeDashboardUrl } from './source'

const COLUMNS = ['createdAt', 'email', 'product', 'amount', 'form', 'channel', 'status', 'link'] as const

export function PurchasesTable({ purchases, stripeLive }: { purchases: AdminPurchase[]; stripeLive: boolean }) {
  if (purchases.length === 0) return <p className="text-sm text-muted-foreground">{COPY.noPurchases}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {purchases.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.createdAt)}</TableCell>
            <TableCell>
              <Link href={`/admin/users/${row.userId}`} className="text-primary hover:underline">
                {row.email ?? row.userId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{row.productId ?? '—'}</TableCell>
            <TableCell className="font-mono">{row.listPriceUsd === null ? '—' : usd.format(row.listPriceUsd)}</TableCell>
            <TableCell className="text-xs">{COPY.forms[row.form]}</TableCell>
            <TableCell className="text-xs">{COPY.channels[row.channel]}</TableCell>
            <TableCell>
              <Badge variant="secondary">{COPY.settled}</Badge>
            </TableCell>
            <TableCell>
              {row.channel === 'stripe' && row.providerId ? (
                <a
                  href={stripeDashboardUrl(row.providerId, stripeLive)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {COPY.openInStripe}
                </a>
              ) : (
                COPY.noLink
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
