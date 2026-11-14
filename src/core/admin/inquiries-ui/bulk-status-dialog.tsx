'use client'

import { useState } from 'react'

import { INQUIRY_STATUSES, type InquiryStatus } from '@/core/inquiries/rules'
import { Button } from '@/core/ui/button'

import { BULK_COPY, BulkDialog, BulkResult, BulkTargets, type BulkOutcome, type ShownSkip } from '../shell/bulk'
import { INQUIRIES_BULK_COPY as BULK } from './bulk-copy'
import { INQUIRIES_COPY as COPY } from './copy'

export type InquiryStatusRun = {
  names: string[]
  pending: boolean
  error: string | null
  outcome: BulkOutcome<string> | null
  shownSkips: ShownSkip[]
  send(status: InquiryStatus): void
  close(): void
}

// 批量改状态: one follow-up status for every ticked inquiry; notes stay, nothing is emailed.
export function BulkStatusDialog({ run }: { run: InquiryStatusRun }) {
  const [status, setStatus] = useState<InquiryStatus>('contacted')
  const n = run.names.length
  return (
    <BulkDialog
      title={BULK.status.title(n)}
      description={BULK.status.body}
      pending={run.pending}
      error={run.error}
      finished={!!run.outcome}
      onClose={run.close}
      confirm={
        <Button disabled={run.pending} onClick={() => run.send(status)}>
          {run.pending ? BULK_COPY.working : BULK.status.confirm(n, COPY.statuses[status])}
        </Button>
      }
    >
      {run.outcome ? (
        <BulkResult done={run.outcome.done.length} skipped={run.shownSkips} />
      ) : (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm text-muted-foreground">{BULK.status.legend}</legend>
            <div className="flex flex-wrap gap-2">
              {INQUIRY_STATUSES.map((value) => (
                <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/15 has-[:checked]:text-primary">
                  <input type="radio" name="inquiry-bulk-status" value={value} checked={status === value} onChange={() => setStatus(value)} className="accent-[var(--primary)]" />
                  {COPY.statuses[value]}
                </label>
              ))}
            </div>
          </fieldset>
          <BulkTargets label={BULK.targets} names={run.names} />
        </>
      )}
    </BulkDialog>
  )
}
