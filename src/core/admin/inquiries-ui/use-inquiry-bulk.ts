'use client'

import { useState } from 'react'

import type { AdminInquiry, AdminInquiryRow } from '@/core/inquiries'
import type { BulkInquirySkip, InquiryStatus } from '@/core/inquiries/rules'

import { useBulkRun, type BulkOutcome, type RowSelection } from '../shell/bulk'
import { toBeijingLocal } from '../shell/format'
import type { ActionValue } from '../templates/types'
import { INQUIRIES_BULK_COPY as BULK } from './bulk-copy'
import type { InquiryStatusRun } from './bulk-status-dialog'
import { inquiriesCsv } from './inquiries-csv'

export type InquiryBulkActions = {
  setStatus(input: { ids: string[]; status: InquiryStatus }): Promise<ActionValue<BulkOutcome<BulkInquirySkip>>>
  exportRows(ids: string[]): Promise<ActionValue<AdminInquiry[]>>
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The status dialog's state plus the two read-only batches (CSV, emails), which need no dialog.
export function useInquiryBulk(rows: AdminInquiryRow[], selection: RowSelection, actions: InquiryBulkActions) {
  const [statusOpen, setStatusOpen] = useState(false)
  const [targets, setTargets] = useState<{ id: string; who: string }[]>([])
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const run = useBulkRun<BulkInquirySkip>(selection.keepOnly)
  const picked = () => rows.filter((row) => selection.ids.includes(row.id))
  const names = new Map(targets.map((target) => [target.id, target.who]))
  const status: InquiryStatusRun = {
    names: targets.map((target) => target.who),
    pending: run.pending,
    error: run.error,
    outcome: run.outcome,
    shownSkips: (run.outcome?.skipped ?? []).map((skip) => ({ id: skip.id, who: names.get(skip.id) ?? skip.id, why: BULK.skips[skip.reason] })),
    send: (next) => run.start(() => actions.setStatus({ ids: targets.map((target) => target.id), status: next })),
    close: () => setStatusOpen(false),
  }
  const openStatus = () => {
    run.reset()
    setNotice(null)
    setTargets(picked().map((row) => ({ id: row.id, who: `${row.company} · ${row.email}` })))
    setStatusOpen(true)
  }
  const exportCsv = async () => {
    setNotice(null)
    setExporting(true)
    const result = await actions.exportRows(selection.ids).catch(() => null)
    setExporting(false)
    if (!result?.ok) return setNotice({ error: true, text: result?.message || BULK.skips.failed })
    download(BULK.fileName(toBeijingLocal(new Date().toISOString()).slice(0, 10)), inquiriesCsv(result.value))
    setNotice({ error: false, text: BULK.exported(result.value.length) })
  }
  const copyEmails = async () => {
    const emails = [...new Set(picked().map((row) => row.email))]
    const ok = await navigator.clipboard?.writeText(emails.join(', ')).then(() => true, () => false)
    setNotice(ok ? { error: false, text: BULK.copied(emails.length) } : { error: true, text: BULK.copyFailed })
  }
  return { statusOpen, openStatus, status, exportCsv, copyEmails, exporting, notice }
}
