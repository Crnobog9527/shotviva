'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import type { WorkLinks } from '../support/view-work'
import type { ActionValue } from '../templates/types'
import { ConfirmDialog } from './confirm-dialog'
import { SUPPORT_COPY } from './copy'
import { WorkDialog } from './work-dialog'

export type JobSupportActions = {
  view: (input: { jobId: string }) => Promise<ActionValue<WorkLinks>>
  compensate: (input: { jobId: string }) => Promise<ActionValue<{ applied: boolean }>>
}

export type SupportJob = { id: string; status: 'running' | 'succeeded' | 'failed'; creditsCost: number; creditPool: 'free' | 'paid' }

// Per-job buttons for the jobs list and the user detail: view the work (writes view_work to
// the audit log on the server) and, for a succeeded job, compensate it once.
export function JobActions({ job, actions }: { job: SupportJob; actions: JobSupportActions }) {
  const [open, setOpen] = useState<'compensate' | null>(null)
  const [links, setLinks] = useState<WorkLinks | null>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const compensate = () =>
    run(
      () => actions.compensate({ jobId: job.id }),
      (result) => {
        setOpen(null)
        return result.applied ? SUPPORT_COPY.compensate.done : SUPPORT_COPY.compensate.already
      },
    )
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => actions.view({ jobId: job.id }), setLinks)}>
        {SUPPORT_COPY.view.button}
      </Button>
      {job.status === 'succeeded' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            clearError()
            setOpen('compensate')
          }}
        >
          {SUPPORT_COPY.compensate.button}
        </Button>
      ) : null}
      {notice ? <span className="text-xs text-success">{notice}</span> : null}
      {error && open === null ? <span className="text-xs text-destructive">{error}</span> : null}
      {open === 'compensate' ? (
        <ConfirmDialog
          title={SUPPORT_COPY.compensate.title}
          body={SUPPORT_COPY.compensate.body(job.creditsCost, SUPPORT_COPY.pools[job.creditPool])}
          confirm={SUPPORT_COPY.compensate.confirm}
          pending={pending}
          error={error}
          onCancel={() => setOpen(null)}
          onConfirm={compensate}
        />
      ) : null}
      {links ? <WorkDialog links={links} onClose={() => setLinks(null)} /> : null}
    </div>
  )
}
