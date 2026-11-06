import type { TrackedJob } from '../generation/job-model'

export type BatchTally = {
  count: number
  done: number
  developing: number
  queued: number
  failed: number
  // Credits the photos that landed cost; failed ones were refunded.
  creditsUsed: number
  // The photo the tray develops: the first one in flight, 1-based; null once none is.
  current: number | null
  settled: boolean
}

// Where a batch stands (T28, B comp workspace.html?batch): counts for the summary line, the
// photo the tray shows, and whether every photo has settled. Each photo is its own job,
// charged and refunded on its own (ARCHITECTURE §6.2 "批量上传的语义").
export function batchTally(jobs: readonly Pick<TrackedJob, 'status' | 'credits'>[]): BatchTally {
  const count = (status: TrackedJob['status']) => jobs.filter((job) => job.status === status).length
  const running = jobs.findIndex((job) => job.status === 'running')
  const queued = count('queued')
  const developing = count('running')
  return {
    count: jobs.length,
    done: count('succeeded'),
    developing,
    queued,
    failed: count('failed'),
    creditsUsed: jobs.filter((job) => job.status === 'succeeded').reduce((sum, job) => sum + job.credits, 0),
    current: running >= 0 ? running + 1 : null,
    settled: developing === 0 && queued === 0,
  }
}

// What the tray shows: the photo in flight as it develops; once none is, the first saved result
// (else the first photo as picked).
export function trayPhoto(jobs: readonly Pick<TrackedJob, 'status' | 'fileUrl' | 'previewUrl'>[], tally: Pick<BatchTally, 'current'>): string | null {
  const shown = tally.current ? jobs[tally.current - 1] : (jobs.find((job) => job.status === 'succeeded') ?? jobs[0])
  if (!shown) return null
  return (shown.status === 'succeeded' ? (shown.fileUrl ?? shown.previewUrl) : shown.previewUrl) ?? null
}
