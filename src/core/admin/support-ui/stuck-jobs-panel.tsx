'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { useAdminAction } from '../shell/use-admin-action'
import type { StuckJob } from '../support/stuck-jobs'
import type { ActionValue } from '../templates/types'
import { ConfirmDialog } from './confirm-dialog'
import { SUPPORT_COPY } from './copy'

const COPY = SUPPORT_COPY.stuck
const COLUMNS = ['createdAt', 'user', 'template', 'credits', 'source', 'action'] as const

export type RefundStuck = (input: { jobId?: string }) => Promise<ActionValue<{ refunded: number; skipped: number }>>

// Target: one job id, or 'all'.
type Target = string | 'all' | null

export function StuckJobsPanel({ jobs, refund }: { jobs: StuckJob[]; refund: RefundStuck }) {
  const [target, setTarget] = useState<Target>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  if (jobs.length === 0 && !notice) return null
  const open = (next: Target) => {
    clearError()
    setTarget(next)
  }
  const confirm = () => {
    const input = target === 'all' ? {} : { jobId: target ?? undefined }
    run(
      () => refund(input),
      (result) => {
        setTarget(null)
        return COPY.done(result.refunded, result.skipped)
      },
    )
  }
  return (
    <section className="grid gap-3 rounded-lg border border-destructive/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{COPY.title(jobs.length)}</h2>
        {jobs.length > 1 ? (
          <Button size="sm" variant="destructive" className="ml-auto" onClick={() => open('all')}>
            {COPY.refundAll}
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{COPY.body}</p>
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {jobs.length > 0 ? <StuckTable jobs={jobs} onRefund={open} /> : null}
      {target ? (
        <ConfirmDialog
          title={target === 'all' ? COPY.confirmAllTitle(jobs.length) : COPY.confirmOneTitle}
          body={COPY.confirmBody}
          confirm={COPY.confirm}
          pending={pending}
          error={error}
          onCancel={() => setTarget(null)}
          onConfirm={confirm}
        />
      ) : null}
    </section>
  )
}

function StuckTable({ jobs, onRefund }: { jobs: StuckJob[]; onRefund: (id: string) => void }) {
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
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(job.createdAt)}</TableCell>
            <TableCell>
              <Link href={`/admin/users/${job.userId}?job=${job.id}`} className="font-mono text-xs text-primary hover:underline">
                {job.userId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{job.templateId}</TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {job.creditsCost} · {SUPPORT_COPY.pools[job.creditPool]}
            </TableCell>
            <TableCell className="text-xs">{SUPPORT_COPY.sources[job.source]}</TableCell>
            <TableCell>
              <Button size="sm" variant="outline" onClick={() => onRefund(job.id)}>
                {COPY.refund}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
