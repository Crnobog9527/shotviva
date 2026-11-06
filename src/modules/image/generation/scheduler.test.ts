import { describe, expect, it } from 'vitest'

import { applyError, applyView, restore, serialize, type TrackedJob } from './job-model'
import { markSent, nextToSend, RATE_LIMIT_RETRY_MS, requeue } from './scheduler'

// T28 batch queue: in flight ≤ the account's concurrency, oldest first, a failure frees its
// slot, and a reload picks the batch up again under the same ids.

const body = { template_id: 'pure-white', input_key: 'inputs/u/a.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' }, batch_size: 5 }

const queued = (index: number): TrackedJob => ({
  id: `job-${index}`,
  templateId: 'pure-white',
  templateName: 'Pure White',
  resolution: '1k',
  aspect: 'original',
  credits: 2,
  inputKey: `inputs/u/${index}.jpg`,
  batchSize: 5,
  queuedAt: 1_000 + index,
  startedAt: 0,
  status: 'queued',
  body,
  fileUrl: null,
  creditPool: null,
  failure: null,
})

const batch = (count: number) => Array.from({ length: count }, (_, index) => queued(index))
const sendAll = (jobs: TrackedJob[], limit: number, now = 2_000) => {
  const ids = new Set(nextToSend(jobs, limit, now))
  return jobs.map((job) => (ids.has(job.id) ? markSent(job, now) : job))
}
const view = (id: string, status: 'succeeded' | 'failed') => ({
  id,
  status,
  credit_pool: 'paid' as const,
  visibility: 'private' as const,
  template_id: 'pure-white',
  credits_cost: 2,
  error_code: status === 'failed' ? 'PROVIDER_FAILED' : null,
  file_url: status === 'succeeded' ? `/api/files/${id}` : null,
  created_at: '',
  finished_at: null,
})

describe('nextToSend: slots', () => {
  it('sends no more than the limit, oldest first', () => {
    expect(nextToSend(batch(5), 3, 2_000)).toEqual(['job-0', 'job-1', 'job-2'])
    // Display order is newest first; the queue still goes by queuedAt.
    expect(nextToSend(batch(5).reverse(), 1, 2_000)).toEqual(['job-0'])
  })

  it('counts every running job against the limit, and sends nothing when it is full', () => {
    const jobs = sendAll(batch(5), 3)
    expect(jobs.filter((job) => job.status === 'running').map((job) => job.id)).toEqual(['job-0', 'job-1', 'job-2'])
    expect(nextToSend(jobs, 3, 2_000)).toEqual([])
  })

  it('fills a freed slot with the next photo when one lands', () => {
    const jobs = sendAll(batch(5), 3).map((job) => (job.id === 'job-1' ? applyView(job, view(job.id, 'succeeded')) : job))
    expect(nextToSend(jobs, 3, 2_000)).toEqual(['job-3'])
  })

  it('a failure frees its slot too and never holds up the rest', () => {
    let jobs = sendAll(batch(4), 1)
    jobs = jobs.map((job) => (job.id === 'job-0' ? applyError(job, { code: 'GENERATION_FAILED', refunded: true }) : job))
    expect(nextToSend(jobs, 1, 2_000)).toEqual(['job-1'])
    jobs = sendAll(jobs, 1).map((job) => (job.id === 'job-1' ? applyView(job, view(job.id, 'failed')) : job))
    expect(nextToSend(jobs, 1, 2_000)).toEqual(['job-2'])
  })

  it('waits out a rate-limit answer instead of failing the photo', () => {
    const [first, ...rest] = sendAll(batch(2), 1)
    const back = requeue(first as TrackedJob, 3_000)
    expect(back.status).toBe('queued')
    expect(nextToSend([back, ...rest], 1, 3_000)).toEqual(['job-1'])
    expect(nextToSend([back], 1, 3_000 + RATE_LIMIT_RETRY_MS)).toEqual(['job-0'])
  })

  it('never sends a job it cannot repeat (no request body)', () => {
    expect(nextToSend([{ ...queued(0), body: undefined }], 3, 2_000)).toEqual([])
  })
})

describe('refresh resume', () => {
  it('brings queued and in-flight photos back, ready to send under the same ids', () => {
    let jobs = sendAll(batch(5), 2, 2_000)
    jobs = jobs.map((job) => (job.id === 'job-0' ? applyView(job, view(job.id, 'succeeded')) : job))
    const back = restore(serialize(jobs), 10_000)
    // The settled photo is in Photos already; the four others come back.
    expect(back.map((job) => job.id).sort()).toEqual(['job-1', 'job-2', 'job-3', 'job-4'])
    // job-1 was in flight: queued again, its first start kept for the progress bar.
    expect(back.find((job) => job.id === 'job-1')).toMatchObject({ status: 'queued', startedAt: 2_000, body })
    expect(nextToSend(back, 2, 10_000)).toEqual(['job-1', 'job-2'])
  })

  it('keeps a resent job’s first start and stamps the new send', () => {
    const resent = markSent({ ...queued(0), startedAt: 2_000 }, 9_000)
    expect(resent).toMatchObject({ status: 'running', startedAt: 2_000, sentAt: 9_000 })
  })
})
