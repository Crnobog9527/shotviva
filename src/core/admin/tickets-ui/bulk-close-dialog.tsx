'use client'

import { Button } from '@/core/ui/button'

import { BULK_COPY, BulkDialog, BulkResult, BulkTargets } from '../shell/bulk'
import { TICKETS_BULK_COPY as COPY } from './bulk-copy'
import type { TicketBulkRun } from './use-ticket-bulk'

// 批量关闭: a bare close of each ticked ticket. No reply text, so nobody is emailed.
export function BulkCloseDialog({ run }: { run: TicketBulkRun }) {
  const n = run.targets.length
  return (
    <BulkDialog
      title={COPY.close.title(n)}
      description={COPY.close.body}
      pending={run.pending}
      error={run.error}
      finished={!!run.outcome}
      onClose={run.close}
      confirm={
        <Button disabled={run.pending} onClick={() => run.send('', true)}>
          {run.pending ? BULK_COPY.working : COPY.close.confirm(n)}
        </Button>
      }
    >
      {run.outcome ? <BulkResult done={run.outcome.done.length} skipped={run.shownSkips} /> : <BulkTargets label={COPY.targets} names={run.targets.map((t) => t.who)} />}
    </BulkDialog>
  )
}
