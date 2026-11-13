'use client'

import { useMemo } from 'react'

import type { AdminInquiryRow, InquiryFilter } from '@/core/inquiries'

import { BULK_COPY, SelectionBar, useRowSelection } from '../shell/bulk'
import { INQUIRIES_BULK_COPY as BULK } from './bulk-copy'
import { BulkStatusDialog } from './bulk-status-dialog'
import { InquiriesTable } from './inquiries-table'
import { useInquiryBulk, type InquiryBulkActions } from './use-inquiry-bulk'

const BAR_ACTIONS = [
  { key: 'status', label: BULK.actions.status, primary: true },
  { key: 'export', label: BULK.actions.export },
  { key: 'emails', label: BULK.actions.emails },
] as const

// The inquiry list with ticks and the batch bar. Changing the status refreshes the page through
// the server action, so rows update in place and the filter and scroll stay put.
export function InquiriesBulkList({ rows, filter, actions }: { rows: AdminInquiryRow[]; filter: InquiryFilter; actions: InquiryBulkActions }) {
  const pageIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selection = useRowSelection(pageIds)
  const bulk = useInquiryBulk(rows, selection, actions)
  const picks: Record<string, () => void> = { status: bulk.openStatus, export: () => void bulk.exportCsv(), emails: () => void bulk.copyEmails() }
  return (
    <div className={selection.ids.length > 0 ? 'grid gap-2 max-md:pb-32' : 'grid gap-2'}>
      <SelectionBar count={selection.ids.length} pending={bulk.status.pending || bulk.exporting} actions={BAR_ACTIONS} onPick={(key) => picks[key]?.()} onClear={selection.clear} />
      <Notice working={bulk.exporting} notice={bulk.notice} />
      <InquiriesTable rows={rows} filter={filter} selection={selection} />
      {bulk.statusOpen ? <BulkStatusDialog run={bulk.status} /> : null}
    </div>
  )
}

function Notice({ working, notice }: { working: boolean; notice: { error: boolean; text: string } | null }) {
  if (working) return <p role="status" className="text-sm text-muted-foreground">{BULK_COPY.working}</p>
  if (!notice) return null
  return (
    <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'text-sm text-destructive' : 'text-sm text-success'}>
      {notice.text}
    </p>
  )
}
