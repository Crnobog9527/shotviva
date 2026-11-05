import type { CreditPool } from '@/core/billing/pools'
import type { JobView } from '@/core/jobs'
import type { OutputAspect, Resolution } from '@/core/templates'

// A generation this browser started, tracked across pages until it settles (DESIGN §4.4:
// leave the workspace, the job keeps going and lands in Photos).
export type JobFailure = { code: string; message: string; refunded: boolean | null }

export type TrackedJob = {
  id: string
  templateId: string
  templateName: string
  resolution: Resolution
  aspect: OutputAspect
  credits: number
  inputKey: string | null
  startedAt: number
  status: 'running' | 'succeeded' | 'failed'
  fileUrl: string | null
  creditPool: CreditPool | null
  failure: JobFailure | null
  // Object URL of the picked photo; this tab only, never persisted.
  previewUrl?: string
}

export type ErrorBodyLike = { code?: string; message?: string; refunded?: boolean }

export function applyView(job: TrackedJob, view: JobView): TrackedJob {
  if (view.status === 'running') return job
  if (view.status === 'succeeded') return { ...job, status: 'succeeded', fileUrl: view.file_url, creditPool: view.credit_pool }
  return { ...job, status: 'failed', failure: { code: view.error_code ?? 'GENERATION_FAILED', message: '', refunded: true } }
}

export function applyError(job: TrackedJob, body: ErrorBodyLike): TrackedJob {
  const failure = { code: body.code ?? 'INTERNAL', message: body.message ?? '', refunded: body.refunded ?? null }
  return { ...job, status: 'failed', failure }
}

// Only running jobs are worth restoring after a reload; one older than the function limit
// died with its function (same 6 minutes as core/jobs RUNNING_STALE_MS).
const STALE_MS = 6 * 60 * 1000

export function serialize(jobs: readonly TrackedJob[]): string {
  // previewUrl: undefined drops the key from the JSON.
  return JSON.stringify(jobs.filter((job) => job.status === 'running').map((job) => ({ ...job, previewUrl: undefined })))
}

export function restore(raw: string | null, now: number): TrackedJob[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as TrackedJob[]).filter((job) => job?.status === 'running' && typeof job.id === 'string' && now - job.startedAt < STALE_MS)
  } catch {
    return []
  }
}
