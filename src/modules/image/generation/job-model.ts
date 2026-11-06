import type { CreditPool } from '@/core/billing/pools'
import type { MembershipTier } from '@/core/config'
import type { JobView } from '@/core/jobs'
import type { OutputAspect, Resolution } from '@/core/templates'

import type { GenerateBody } from './job-api'

// A generation this browser started, tracked across pages until it settles (DESIGN §4.4:
// leave the workspace, the job keeps going and lands in Photos). A batch (ARCHITECTURE §6.2
// "批量上传的语义") is N of these, each its own job: 'queued' waits in this tab until the
// scheduler has a free slot under the account's concurrency, then it is 'running'.
export type JobFailure = { code: string; message: string; refunded: boolean | null; requiredTier?: MembershipTier }

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type TrackedJob = {
  id: string
  templateId: string
  templateName: string
  resolution: Resolution
  aspect: OutputAspect
  credits: number
  inputKey: string | null
  // Photos in the batch this job belongs to; 1 for a single photo (`generate` batch_size).
  batchSize: number
  // When it joined the queue: dispatch order, oldest first.
  queuedAt: number
  // When its request first went out (the progress estimate); 0 while it has never been sent.
  startedAt: number
  // When its latest request went out (a resend after a reload); the 404 grace counts from here.
  sentAt?: number
  // A queued job the server turned away for the rate limit waits until then (ms epoch).
  retryAt?: number
  status: JobStatus
  // The request, so a reload can send it again under the same id and Retry can repeat it.
  body?: GenerateBody
  fileUrl: string | null
  creditPool: CreditPool | null
  failure: JobFailure | null
  // Object URL of the picked photo; this tab only, never persisted.
  previewUrl?: string
}

export type ErrorBodyLike = { code?: string; message?: string; refunded?: boolean; required_tier?: MembershipTier }

const settledFields = { retryAt: undefined }

export function applyView(job: TrackedJob, view: JobView): TrackedJob {
  if (view.status === 'running') return job
  if (view.status === 'succeeded') return { ...job, ...settledFields, status: 'succeeded', fileUrl: view.file_url, creditPool: view.credit_pool }
  return { ...job, ...settledFields, status: 'failed', failure: { code: view.error_code ?? 'GENERATION_FAILED', message: '', refunded: true } }
}

export function applyError(job: TrackedJob, body: ErrorBodyLike): TrackedJob {
  const failure: JobFailure = { code: body.code ?? 'INTERNAL', message: body.message ?? '', refunded: body.refunded ?? null }
  if (body.required_tier) failure.requiredTier = body.required_tier
  return { ...job, ...settledFields, status: 'failed', failure }
}

// Only unsettled jobs are worth restoring after a reload. A running one older than the
// function limit died with its function (same 6 minutes as core/jobs RUNNING_STALE_MS); a
// queued one is dropped after an hour, the photo's moment has passed.
const RUNNING_STALE_MS = 6 * 60 * 1000
const QUEUED_STALE_MS = 60 * 60 * 1000

const isUnsettled = (job: TrackedJob) => job.status === 'running' || job.status === 'queued'

export function serialize(jobs: readonly TrackedJob[]): string {
  // previewUrl: undefined drops the key from the JSON.
  return JSON.stringify(jobs.filter(isUnsettled).map((job) => ({ ...job, previewUrl: undefined })))
}

function fresh(job: TrackedJob, now: number): boolean {
  if (job.status === 'running') return now - job.startedAt < RUNNING_STALE_MS
  return now - job.queuedAt < QUEUED_STALE_MS
}

// A job that was running when the tab reloaded lost its request, so it goes back in the queue
// and is sent again under the same id: the server answers with the job it already has (no
// second charge) or starts it if the first request never arrived. One without a body (written
// before T28) can only be polled.
function resumed(job: TrackedJob): TrackedJob {
  const queuedAt = job.queuedAt ?? job.startedAt
  const batchSize = job.batchSize ?? 1
  if (job.status === 'running' && job.body) return { ...job, queuedAt, batchSize, status: 'queued', retryAt: undefined }
  return { ...job, queuedAt, batchSize }
}

export function restore(raw: string | null, now: number): TrackedJob[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as TrackedJob[])
      .filter((job) => job && typeof job.id === 'string' && isUnsettled(job) && fresh(job, now))
      .map(resumed)
  } catch {
    return []
  }
}
