import type { JobFailure, TrackedJob } from './job-model'

// What the app-wide notice says when this tab's jobs settle (the toast, the tab title, the
// browser notification): pure, so the wording rules are tested without a DOM.

// What a notice needs of a settled job: this tab's TrackedJob, or a server row Photos polled.
export type SettledItem = Pick<TrackedJob, 'id' | 'templateName' | 'failure'>
export type Settled = { ready: SettledItem[]; failed: SettledItem[] }

// Jobs that were queued or running at the last look and have settled since. A job seen for the
// first time already settled (restored after a reload) was announced before, or never needs to be.
export function newlySettled(before: ReadonlyMap<string, TrackedJob['status']>, jobs: readonly TrackedJob[]): Settled {
  const changed = jobs.filter((job) => {
    const was = before.get(job.id)
    return (was === 'queued' || was === 'running') && (job.status === 'succeeded' || job.status === 'failed')
  })
  return { ready: changed.filter((job) => job.status === 'succeeded'), failed: changed.filter((job) => job.status === 'failed') }
}

export const statusMap = (jobs: readonly TrackedJob[]) => new Map(jobs.map((job) => [job.id, job.status]))

// Each job once, even when this tab and the Photos poll both saw it settle.
export function merge(a: Settled, b: Settled): Settled {
  const seen = new Set([...a.ready, ...a.failed].map((item) => item.id))
  const fresh = (item: SettledItem) => !seen.has(item.id)
  return { ready: [...a.ready, ...b.ready.filter(fresh)], failed: [...a.failed, ...b.failed.filter(fresh)] }
}

// Jobs this tab never tracked (started in a tab since closed) that Photos saw settle: the same
// notice, through this one listener (SettleToast).
const announced = new Set<(news: Settled) => void>()

export function onAnnounce(listener: (news: Settled) => void): () => void {
  announced.add(listener)
  return () => announced.delete(listener)
}

export function announce(news: Settled) {
  if (news.ready.length || news.failed.length) announced.forEach((listener) => listener(news))
}

// Where several failures' credits stand, one line for all: any refund still on hold says so;
// otherwise refunded if any was charged, else nothing was used (app.errors keys).
export function refundKey(failures: readonly (JobFailure | null)[]): 'refunded' | 'onHold' | 'notCharged' {
  if (failures.some((failure) => failure?.refunded === false)) return 'onHold'
  if (failures.some((failure) => failure?.refunded === true)) return 'refunded'
  return 'notCharged'
}

// The tab title while jobs develop: one photo's estimated percent, a batch's done / count; a
// settled tab out of view says Ready (or that it failed) until it is looked at again.
export type TitleState = { kind: 'percent'; percent: number } | { kind: 'count'; done: number; count: number } | { kind: 'ready' } | { kind: 'failed' } | null

// What the user waits on: every active job, and those that settled after the oldest active one
// joined the queue (the rest of its batch). Earlier work that settled before then is not counted.
export function titleCohort(jobs: readonly TrackedJob[]): TrackedJob[] {
  const isActive = (job: TrackedJob) => job.status === 'queued' || job.status === 'running'
  const active = jobs.filter(isActive)
  if (active.length === 0) return []
  const from = Math.min(...active.map((job) => job.queuedAt))
  return jobs.filter((job) => isActive(job) || (job.settledAt ?? 0) >= from)
}

export function withTitle(base: string, prefix: string | null): string {
  return prefix ? `${prefix} · ${base}` : base
}
