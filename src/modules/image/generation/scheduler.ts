import type { TrackedJob } from './job-model'

// The batch queue's one rule (ARCHITECTURE §6.2 "批量上传的语义"): never more requests in flight
// than the account's concurrency (TIER_LIMITS), oldest queued photo first. A settled job,
// failed or not, frees its slot for the next one, so one failure never holds up the rest.

// How long a photo the server turned away with RATE_LIMITED (another tab's jobs, the
// 10-minute window, a tier that just lapsed) waits before it is sent again.
export const RATE_LIMIT_RETRY_MS = 15_000

export function nextToSend(jobs: readonly TrackedJob[], limit: number, now: number): string[] {
  const inFlight = jobs.filter((job) => job.status === 'running').length
  const slots = Math.max(0, limit - inFlight)
  if (slots === 0) return []
  return jobs
    .filter((job) => job.status === 'queued' && job.body !== undefined && (job.retryAt ?? 0) <= now)
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .slice(0, slots)
    .map((job) => job.id)
}

// Sent: the request is out. startedAt keeps the first send, so a resend after a reload does not
// restart the progress estimate.
export function markSent(job: TrackedJob, now: number): TrackedJob {
  return { ...job, status: 'running', startedAt: job.startedAt || now, sentAt: now, retryAt: undefined }
}

// RATE_LIMITED is not a failure for a queued photo: back in line, tried again later.
export function requeue(job: TrackedJob, now: number): TrackedJob {
  return { ...job, status: 'queued', retryAt: now + RATE_LIMIT_RETRY_MS }
}

export const isActive = (job: TrackedJob) => job.status === 'queued' || job.status === 'running'
