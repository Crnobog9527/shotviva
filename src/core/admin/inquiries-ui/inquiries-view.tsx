import Link from 'next/link'

import type { AdminInquiryRow, InquiryFilter } from '@/core/inquiries'
import { INQUIRY_STATUSES, type InquiryStatus } from '@/core/inquiries/rules'
import { Badge } from '@/core/ui/badge'
import { cn } from '@/core/ui/cn'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { Page } from '../cursor'
import { EmptyState } from '../shell/admin-blocks'
import { RecordLink } from '../shell/record-dialog'
import { INQUIRY_PARAM } from '../shell/record-dialog-url'
import { formatBeijing } from '../shell/format'
import { INQUIRIES_COPY as COPY } from './copy'

type Props = { filter: InquiryFilter; page: Page<AdminInquiryRow>; paged: boolean }

// /admin/inquiries (ARCHITECTURE §10.c): every inquiry, newest first; filter by status. A row opens
// the inquiry in a dialog over the list (?inquiry=<id>, inquiry-dialog.tsx).
export function InquiriesView({ filter, page, paged }: Props) {
  return (
    <div className="grid gap-4">
      <Filters filter={filter} />
      {page.items.length === 0 ? <EmptyState title={COPY.empty} /> : <InquiriesTable rows={page.items} filter={filter} />}
      <div className="flex gap-4 text-sm">
        {paged ? (
          <Link href={inquiriesHref(filter)} className="text-primary hover:underline">
            {COPY.firstPage}
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={inquiriesHref(filter, page.nextCursor)} className="text-primary hover:underline">
            {COPY.nextPage}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export function inquiriesHref(filter: InquiryFilter, cursor?: string): string {
  const params = new URLSearchParams()
  if (filter.status !== 'all') params.set('status', filter.status)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return query ? `/admin/inquiries?${query}` : '/admin/inquiries'
}

function Filters({ filter }: { filter: InquiryFilter }) {
  const statuses = ['all', ...INQUIRY_STATUSES] as const
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-2 text-sm text-muted-foreground">{COPY.filters.status}</span>
      {statuses.map((status) => (
        <Link
          key={status}
          href={inquiriesHref({ status })}
          aria-current={filter.status === status ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center rounded-md px-3 text-sm',
            filter.status === status ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {status === 'all' ? COPY.filters.all : COPY.statuses[status]}
        </Link>
      ))}
    </div>
  )
}

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return <Badge variant={status === 'new' ? 'default' : 'secondary'}>{COPY.statuses[status]}</Badge>
}

const COLUMNS = ['createdAt', 'company', 'name', 'email', 'volume', 'uses', 'status'] as const

function InquiriesTable({ rows, filter }: { rows: AdminInquiryRow[]; filter: InquiryFilter }) {
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
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.created_at)}</TableCell>
            <TableCell className="min-w-40 whitespace-normal">
              <RecordLink param={INQUIRY_PARAM} base={inquiriesHref(filter)} id={row.id} className="line-clamp-2 text-sm font-medium">
                {row.company}
              </RecordLink>
            </TableCell>
            <TableCell className="text-sm">
              <span className="block max-w-32 truncate" title={row.name}>
                {row.name}
              </span>
            </TableCell>
            <TableCell className="text-sm">
              <span className="block max-w-52 truncate" title={row.email}>
                {row.email}
              </span>
            </TableCell>
            <TableCell className="text-sm whitespace-nowrap">{COPY.volumes[row.monthly_volume]}</TableCell>
            <TableCell className="min-w-40 text-sm whitespace-normal">{row.uses.map((use) => COPY.uses[use]).join('、')}</TableCell>
            <TableCell className="whitespace-nowrap">
              <StatusBadge status={row.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
