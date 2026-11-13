'use client'

import type { AdminListFilter, AdminTicketRow } from '@/core/support'
import { Badge } from '@/core/ui/badge'
import { cn } from '@/core/ui/cn'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { AllTick, RowTick, type RowSelection } from '../shell/bulk'
import { RecordLink } from '../shell/record-dialog'
import { TICKET_PARAM } from '../shell/record-dialog-url'
import { formatBeijing } from '../shell/format'
import { TICKETS_BULK_COPY as BULK } from './bulk-copy'
import { TICKETS_COPY as COPY } from './copy'
import { ticketsHref } from './tickets-href'

// The reply's due time; late open tickets in red with the word, not only the colour.
function DueAt({ row }: { row: AdminTicketRow }) {
  if (row.status !== 'open') return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn('font-mono text-xs', row.overdue && 'font-semibold text-destructive')}>
      {formatBeijing(row.dueAt)}
      {row.overdue ? <span className="ml-1 font-sans">{COPY.overdue}</span> : null}
    </span>
  )
}

const COLUMNS = ['dueAt', 'lastMessageAt', 'email', 'tier', 'type', 'status', 'preview'] as const

export const ticketWho = (row: AdminTicketRow) => row.email ?? row.userId.slice(0, 8)

// One page of tickets with a tick per row. A closed ticket has no batch to join, so its tick is
// locked with the reason.
export function TicketsTable({ rows, filter, selection }: { rows: AdminTicketRow[]; filter: AdminListFilter; selection: RowSelection }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <AllTick selection={selection} disabled={rows.every((row) => row.status === 'closed')} />
          </TableHead>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-state={selection.has(row.id) ? 'selected' : undefined}>
            <TableCell className="w-10">
              <RowTick id={row.id} label={ticketWho(row)} selection={selection} locked={row.status === 'closed' ? BULK.closedLocked : null} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <DueAt row={row} />
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.lastMessageAt)}</TableCell>
            <TableCell className="text-sm">
              <span className="block max-w-44 truncate" title={row.email ?? row.userId}>
                {ticketWho(row)}
              </span>
            </TableCell>
            <TableCell className="text-sm whitespace-nowrap">{COPY.tiers[row.tier ?? 'none']}</TableCell>
            <TableCell className="text-sm whitespace-nowrap">{COPY.types[row.type]}</TableCell>
            <TableCell className="whitespace-nowrap">
              <Badge variant={row.status === 'open' ? 'default' : 'secondary'}>{COPY.statuses[row.status]}</Badge>
              {row.refundDecision ? <span className="ml-2 text-xs text-muted-foreground">{COPY.decisions[row.refundDecision]}</span> : null}
            </TableCell>
            <TableCell className="min-w-64 whitespace-normal">
              <RecordLink param={TICKET_PARAM} base={ticketsHref(filter)} id={row.id} className="line-clamp-2 text-sm">
                {row.preview ?? '—'}
              </RecordLink>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
