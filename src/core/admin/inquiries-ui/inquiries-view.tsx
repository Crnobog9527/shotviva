import Link from 'next/link'

import type { AdminInquiryRow, InquiryFilter } from '@/core/inquiries'
import { INQUIRY_STATUSES } from '@/core/inquiries/rules'
import { cn } from '@/core/ui/cn'

import type { Page } from '../cursor'
import { EmptyState } from '../shell/admin-blocks'
import { INQUIRIES_COPY as COPY } from './copy'
import { InquiriesBulkList } from './inquiries-bulk-list'
import { inquiriesHref } from './inquiries-href'
import type { InquiryBulkActions } from './use-inquiry-bulk'

type Props = { filter: InquiryFilter; page: Page<AdminInquiryRow>; paged: boolean; bulk: InquiryBulkActions }

// /admin/inquiries (ARCHITECTURE §10.c): every inquiry, newest first; filter by status. A row opens
// the inquiry in a dialog over the list (?inquiry=<id>, inquiry-dialog.tsx).
export function InquiriesView({ filter, page, paged, bulk }: Props) {
  return (
    <div className="grid gap-4">
      <Filters filter={filter} />
      {page.items.length === 0 ? <EmptyState title={COPY.empty} /> : <InquiriesBulkList rows={page.items} filter={filter} actions={bulk} />}
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

export { inquiriesHref }
export { StatusBadge } from './status-badge'

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
