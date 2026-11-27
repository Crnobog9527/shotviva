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

// A 429 (RATE_LIMITED or the firewall's own) is not a failure for a photo: back in line, tried
// again after the server's Retry-After (job-api), or RATE_LIMIT_RETRY_MS without one.
export function requeue(job: TrackedJob, now: number, delayMs = RATE_LIMIT_RETRY_MS): TrackedJob {
  return { ...job, status: 'queued', retryAt: now + delayMs }
}

// How often the store asks the server about its running jobs (one GET for all of them,
// job-api readJobs). A single photo is watched closely; a batch-only list starts at 5 s and
// backs off to 15 s while nothing changes, so a big batch does not poll every few seconds for
// minutes on end. `quiet` counts passes in a row that changed nothing.
export const POLL_SINGLE_MS = 3_000
export const POLL_BATCH_MS = 5_000
export const POLL_BATCH_MAX_MS = 15_000

export function pollIntervalMs(running: readonly TrackedJob[], quiet: number): number {
  if (running.some((job) => job.batchSize <= 1)) return POLL_SINGLE_MS
  return Math.min(POLL_BATCH_MAX_MS, Math.round(POLL_BATCH_MS * 1.5 ** quiet))
}

export const isActive = (job: TrackedJob) => job.status === 'queued' || job.status === 'running'
