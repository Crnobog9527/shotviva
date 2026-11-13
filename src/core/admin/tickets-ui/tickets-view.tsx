import Link from 'next/link'

import { BASE_SUPPORT_REPLY_HOURS, TIER_LIMITS } from '@/core/billing'
import type { AdminListFilter, AdminTicketRow, Page } from '@/core/support'
import { TICKET_STATUSES, TICKET_TYPES } from '@/core/support/rules'
import { Badge } from '@/core/ui/badge'
import { cn } from '@/core/ui/cn'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { EmptyState } from '../shell/admin-blocks'
import { RecordLink } from '../shell/record-dialog'
import { TICKET_PARAM } from '../shell/record-dialog-url'
import { formatBeijing } from '../shell/format'
import { TICKETS_COPY as COPY } from './copy'

type Props = { filter: AdminListFilter; page: Page<AdminTicketRow>; paged: boolean }

// /admin/tickets: open tickets by default, most recently active first; filter by status and type.
// A row opens the ticket in a dialog over the list (?ticket=<id>, ticket-dialog.tsx).
export function TicketsView({ filter, page, paged }: Props) {
  return (
    <div className="grid gap-4">
      <Filters filter={filter} />
      {filter.status === 'open' ? <p className="text-xs text-muted-foreground">{COPY.sortHint({
            starter: TIER_LIMITS.starter.supportHours,
            pro: TIER_LIMITS.pro.supportHours,
            max: TIER_LIMITS.max.supportHours,
            base: BASE_SUPPORT_REPLY_HOURS,
          })}</p> : null}
      {page.items.length === 0 ? <EmptyState title={COPY.empty} /> : <TicketsTable rows={page.items} filter={filter} />}
      <div className="flex gap-4 text-sm">
        {paged ? (
          <Link href={ticketsHref(filter)} className="text-primary hover:underline">
            {COPY.firstPage}
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={ticketsHref(filter, page.nextCursor)} className="text-primary hover:underline">
            {COPY.nextPage}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export function ticketsHref(filter: AdminListFilter, cursor?: string): string {
  const params = new URLSearchParams()
  if (filter.status !== 'open') params.set('status', filter.status)
  if (filter.type) params.set('type', filter.type)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return query ? `/admin/tickets?${query}` : '/admin/tickets'
}

function Chip({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center rounded-md px-3 text-sm',
        current ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )
}

function Filters({ filter }: { filter: AdminListFilter }) {
  const statuses = [...TICKET_STATUSES, 'all'] as const
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-sm text-muted-foreground">{COPY.filters.status}</span>
        {statuses.map((status) => (
          <Chip key={status} href={ticketsHref({ ...filter, status })} current={filter.status === status}
            label={status === 'all' ? COPY.filters.all : COPY.statuses[status]} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-sm text-muted-foreground">{COPY.filters.type}</span>
        <Chip href={ticketsHref({ ...filter, type: undefined })} current={!filter.type} label={COPY.filters.allTypes} />
        {TICKET_TYPES.map((type) => (
          <Chip key={type} href={ticketsHref({ ...filter, type })} current={filter.type === type} label={COPY.types[type]} />
        ))}
      </div>
    </div>
  )
}

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

function TicketsTable({ rows, filter }: { rows: AdminTicketRow[]; filter: AdminListFilter }) {
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
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">
              <DueAt row={row} />
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.lastMessageAt)}</TableCell>
            <TableCell className="text-sm">
              <span className="block max-w-44 truncate" title={row.email ?? row.userId}>
                {row.email ?? row.userId.slice(0, 8)}
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
