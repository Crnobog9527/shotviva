import Link from 'next/link'

import { BASE_SUPPORT_REPLY_HOURS, TIER_LIMITS } from '@/core/billing'
import type { AdminListFilter, AdminTicketRow, Page } from '@/core/support'
import { TICKET_STATUSES, TICKET_TYPES } from '@/core/support/rules'
import { cn } from '@/core/ui/cn'

import { EmptyState } from '../shell/admin-blocks'
import { TICKETS_COPY as COPY } from './copy'
import { TicketsBulkList } from './tickets-bulk-list'
import { ticketsHref } from './tickets-href'
import type { TicketBulkActions } from './use-ticket-bulk'

type Props = { filter: AdminListFilter; page: Page<AdminTicketRow>; paged: boolean; bulk: TicketBulkActions }

// /admin/tickets: open tickets by default, most recently active first; filter by status and type.
// A row opens the ticket in a dialog over the list (?ticket=<id>, ticket-dialog.tsx); ticked rows
// take a batch (tickets-bulk-list.tsx).
export function TicketsView({ filter, page, paged, bulk }: Props) {
  return (
    <div className="grid gap-4">
      <Filters filter={filter} />
      {filter.status === 'open' ? <p className="text-xs text-muted-foreground">{COPY.sortHint({
            starter: TIER_LIMITS.starter.supportHours,
            pro: TIER_LIMITS.pro.supportHours,
            max: TIER_LIMITS.max.supportHours,
            base: BASE_SUPPORT_REPLY_HOURS,
          })}</p> : null}
      {page.items.length === 0 ? <EmptyState title={COPY.empty} /> : <TicketsBulkList rows={page.items} filter={filter} actions={bulk} />}
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

export { ticketsHref }

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
