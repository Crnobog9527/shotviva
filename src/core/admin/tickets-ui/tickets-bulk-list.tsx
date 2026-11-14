'use client'

import { useMemo } from 'react'

import type { AdminListFilter, AdminTicketRow } from '@/core/support'

import { SelectionBar, useRowSelection } from '../shell/bulk'
import { BulkCloseDialog } from './bulk-close-dialog'
import { TICKETS_BULK_COPY as COPY } from './bulk-copy'
import { BulkReplyDialog } from './bulk-reply-dialog'
import { TicketsTable } from './tickets-table'
import { useTicketBulk, type TicketBulkActions, type TicketBulkKind } from './use-ticket-bulk'

const BAR_ACTIONS = [
  { key: 'reply', label: COPY.actions.reply },
  { key: 'close', label: COPY.actions.close },
] as const

// The ticket list with ticks and the batch bar. A batch's server action refreshes the page, so
// rows update in place and the filter and scroll stay where they were.
export function TicketsBulkList({ rows, filter, actions }: { rows: AdminTicketRow[]; filter: AdminListFilter; actions: TicketBulkActions }) {
  const pageIds = useMemo(() => rows.filter((row) => row.status !== 'closed').map((row) => row.id), [rows])
  const selection = useRowSelection(pageIds)
  const bulk = useTicketBulk(rows, selection, actions)
  return (
    // Room under the last row for the floating bar on phones.
    <div className={selection.ids.length > 0 ? 'grid gap-2 max-md:pb-32' : 'grid gap-2'}>
      <SelectionBar
        count={selection.ids.length}
        pending={bulk.state.pending}
        actions={BAR_ACTIONS}
        onPick={(key) => bulk.open(key as TicketBulkKind)}
        onClear={selection.clear}
      />
      <TicketsTable rows={rows} filter={filter} selection={selection} />
      {bulk.kind === 'close' ? <BulkCloseDialog run={bulk.state} /> : null}
      {bulk.kind === 'reply' ? <BulkReplyDialog run={bulk.state} /> : null}
    </div>
  )
}
