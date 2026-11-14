'use server'

import { refresh } from 'next/cache'

import { compensateJob, refundStuckJobs, runAdminQuery, viewWork, type ActionValue, type RefundOutcome, type WorkLinks } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { refundStalePhotos, type StaleRefund } from '@/core/poster/stale-photos'
import { r2Store } from '@/core/storage'

// Support actions on jobs (T25). Server actions are public endpoints, so each one re-checks the
// admin role; job ids are validated again in core/admin/support. Shared by /admin/jobs and the
// user detail page.

type JobInput = { jobId?: unknown }

export async function viewWorkAction(input: JobInput): Promise<ActionValue<WorkLinks>> {
  await requireAdmin()
  return runAdminQuery(() => viewWork({ db: createAdminSupabase(), store: r2Store() }, input.jobId))
}

export async function compensateJobAction(input: JobInput): Promise<ActionValue<{ applied: boolean }>> {
  await requireAdmin()
  return runAdminQuery(async () => {
    const { applied } = await compensateJob(createAdminSupabase(), input.jobId)
    refresh()
    return { applied }
  })
}

export async function refundStuckAction(input: JobInput): Promise<ActionValue<RefundOutcome>> {
  await requireAdmin()
  const jobId = typeof input.jobId === 'string' ? input.jobId : undefined
  return runAdminQuery(async () => {
    const outcome = await refundStuckJobs(createAdminSupabase(), jobId)
    refresh()
    return outcome
  })
}

// Charged 拍照识别 runs pending past 10 minutes (§5.3): the database picks them again.
export async function refundStalePhotosAction(): Promise<ActionValue<StaleRefund>> {
  await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await refundStalePhotos(createAdminSupabase())
    refresh()
    return outcome
  })
}
