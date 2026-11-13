import { describe, expect, it } from 'vitest'

import type { TrackedJob } from '../generation/job-model'
import { decodeState, encodeState } from '../generation/store-persistence'
import { batchSearch } from './batch-query'
import { MATRIX_VIEW } from './use-matrix-draft'

// 总控 2026-11-12: closing Batch create's dialog while a batch develops (or after it settles)
// must not lose it. Closing only takes ?batch and &t out of the address; the batch's jobs stay in
// the generation store under MATRIX_VIEW (the app-wide runner keeps sending them), and that view
// rides through a refresh, so reopening (the card, or ?batch=1 after a reload) lands on the
// progress or results, not an empty form. The rows themselves are in generation_jobs (Photos).

const job = (id: string, patch: Partial<TrackedJob> = {}): TrackedJob => ({
  id,
  templateId: 'white',
  templateName: 'White',
  resolution: '1k',
  aspect: 'original',
  credits: 43,
  inputKey: `inputs/u/${id}.jpg`,
  batchSize: 2,
  batchId: 'batch-1',
  queuedAt: 1_000,
  startedAt: 1_000,
  sentAt: 1_000,
  status: 'running',
  body: { template_id: 'white', input_key: `inputs/u/${id}.jpg`, inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' }, batch_size: 2 },
  fileUrl: null,
  creditPool: null,
  failure: null,
  ...patch,
})

const reload = (jobs: TrackedJob[]) => decodeState(encodeState({ limit: 3, jobs, views: { [MATRIX_VIEW]: jobs.map((j) => j.id) } }), 5_000)

describe('Batch create after closing or a refresh', () => {
  it('closing touches only the address, never the batch', () => {
    expect(batchSearch(new URLSearchParams('batch=1&t=white'), null)).toBe('')
  })

  it('a developing batch comes back under its view, ready to be sent on', () => {
    const back = reload([job('a'), job('b', { status: 'queued', sentAt: undefined })])
    expect(back.views[MATRIX_VIEW]).toEqual(['a', 'b'])
    expect(back.jobs.map((j) => [j.id, j.batchId])).toEqual([['a', 'batch-1'], ['b', 'batch-1']])
  })

  it('a settled batch comes back with its results (and its batch id for the ZIP)', () => {
    const done = (id: string) => job(id, { status: 'succeeded', fileUrl: `/api/files/${id}`, creditPool: 'paid', settledAt: 4_000 })
    const back = reload([done('a'), done('b')])
    expect(back.views[MATRIX_VIEW]).toEqual(['a', 'b'])
    expect(back.jobs.every((j) => j.status === 'succeeded' && j.batchId === 'batch-1')).toBe(true)
  })
})
