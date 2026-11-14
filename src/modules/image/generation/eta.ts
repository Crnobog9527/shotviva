import type { DurationEstimate } from '@/core/jobs/duration-summary'

import type { TrackedJob } from './job-model'
import { estimatedProgress } from './progress'

// The wait screen's numbers from real durations (GET /api/generate/estimate): the bar, "usually
// about X s", "taking longer than usual", and how long a queued photo waits for its turn. No
// estimate (too few real jobs): the bar keeps its generic curve and no number is shown.
export type Eta = Pick<DurationEstimate, 'p50Ms' | 'p75Ms'>

const CEILING = 0.95
// Past this share of p75 the bar slows down (it never claims to be done before the job is).
const KNEE = 0.85
// Late: half again past p75, and at least 20 s past the usual time, so a quick model is not
// called slow for running a few seconds over.
const LATE_FACTOR = 1.5
const LATE_MIN_MS = 20_000

// Linear to KNEE at p75 (most jobs end near there), then easing toward the ceiling.
export function etaProgress(elapsedMs: number, eta: Eta | null): number {
  if (!eta) return estimatedProgress(elapsedMs)
  if (elapsedMs <= 0) return 0
  const expected = Math.max(eta.p75Ms, 1)
  if (elapsedMs <= expected) return (elapsedMs / expected) * KNEE
  return Math.min(CEILING, KNEE + (CEILING - KNEE) * (1 - Math.exp(-(elapsedMs - expected) / expected)))
}

export function isLate(elapsedMs: number, eta: Eta | null): boolean {
  if (!eta) return false
  return elapsedMs > Math.max(eta.p75Ms * LATE_FACTOR, eta.p50Ms + LATE_MIN_MS)
}

// Seconds the copy shows: no false precision. Under a minute in steps of 5 (at least 10), then
// steps of 10; the caller words minutes past 90 s.
export function roundedSeconds(ms: number): number {
  const seconds = ms / 1000
  if (seconds < 60) return Math.max(10, Math.round(seconds / 5) * 5)
  return Math.round(seconds / 10) * 10
}

export type QueueSpot = { ahead: number; waitMs: number | null }

// Where a queued photo stands in this tab's line (scheduler.ts: oldest first, `limit` at a time):
// how many photos go before it, and roughly when its turn comes, in whole rounds of p50.
export function queueSpot(jobs: readonly TrackedJob[], job: TrackedJob, limit: number, eta: Eta | null): QueueSpot | null {
  if (job.status !== 'queued') return null
  const running = jobs.filter((other) => other.status === 'running').length
  const ahead = jobs.filter((other) => other.status === 'queued' && other.queuedAt < job.queuedAt).length
  const slots = Math.max(1, limit)
  const rounds = Math.ceil(Math.max(0, ahead + running + 1 - slots) / slots)
  return { ahead: ahead + running, waitMs: eta ? rounds * eta.p50Ms : null }
}
