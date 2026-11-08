import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { ORDERS_COPY as COPY } from './copy'
import { formatMinor } from './money'
import type { AdminPurchase } from './repository'
import { stripeDashboardUrl } from './source'
import { ClawbackButton, ClawbackStatus, type ClawbackActions } from '../clawback-ui'
import { UserLink } from '../users-ui/user-link'

// ARCHITECTURE §10: time, buyer, product, amount, method, channel, status, link. Amounts are
// what was charged (payments, T10), in the charge's own currency.
const COLUMNS = ['createdAt', 'email', 'product', 'amount', 'tax', 'refunded', 'credits', 'method', 'form', 'channel', 'status', 'link'] as const

function ProviderLink({ row, stripeLive }: { row: AdminPurchase; stripeLive: boolean }) {
  if (row.channel !== 'stripe' || !row.providerId) return <span className="font-mono text-xs">{row.providerId ?? COPY.noLink}</span>
  return (
    <a href={stripeDashboardUrl(row.providerId, stripeLive)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
      {COPY.openInStripe}
    </a>
  )
}

type RowProps = { row: AdminPurchase; stripeLive: boolean; clawback?: ClawbackActions }

function PurchaseRow({ row, stripeLive, clawback }: RowProps) {
  const money = (amount: number) => formatMinor(amount, row.currency)
  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.createdAt)}</TableCell>
      <TableCell>
        <UserLink userId={row.userId} title={row.email ?? row.userId} className="block max-w-44 truncate">{row.email ?? row.userId.slice(0, 8)}</UserLink>
      </TableCell>
      <TableCell className="font-mono text-xs">{row.productId}</TableCell>
      <TableCell className="font-mono">{money(row.amountTotal)}</TableCell>
      <TableCell className="font-mono text-xs">{money(row.amountTax)}</TableCell>
      <TableCell className="font-mono text-xs">{row.amountRefunded > 0 ? money(row.amountRefunded) : COPY.noLink}</TableCell>
      <TableCell>
        <span className="grid gap-1">
          <ClawbackStatus clawedBack={row.creditsClawedBack} shortfall={row.clawbackShortfall} />
          {clawback ? <ClawbackButton paymentId={row.id} actions={clawback} /> : null}
        </span>
      </TableCell>
      <TableCell className="text-xs">{COPY.methods[row.method]}</TableCell>
      <TableCell className="text-xs">{COPY.forms[row.form]}</TableCell>
      <TableCell className="text-xs">{COPY.channels[row.channel]}</TableCell>
      <TableCell>
        <Badge variant={row.status === 'paid' ? 'secondary' : 'destructive'}>{COPY.statuses[row.status]}</Badge>
      </TableCell>
      <TableCell>
        <ProviderLink row={row} stripeLive={stripeLive} />
      </TableCell>
    </TableRow>
  )
}

export function PurchasesTable({ purchases, stripeLive, clawback }: { purchases: AdminPurchase[]; stripeLive: boolean; clawback?: ClawbackActions }) {
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
          <PurchaseRow key={row.id} row={row} stripeLive={stripeLive} clawback={clawback} />
        ))}
      </TableBody>
    </Table>
  )
}
