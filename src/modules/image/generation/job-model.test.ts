import { describe, expect, it } from 'vitest'

import type { JobView } from '@/core/jobs'

import { applyError, applyView, restore, serialize, type TrackedJob } from './job-model'

const job: TrackedJob = {
  id: '11111111-1111-4111-8111-111111111111',
  templateId: 'pure-white',
  templateName: 'Pure White',
  resolution: '1k',
  aspect: 'original',
  credits: 2,
  inputKey: 'inputs/u/a.jpg',
  startedAt: 1_000,
  status: 'running',
  fileUrl: null,
  creditPool: null,
  failure: null,
  previewUrl: 'blob:x',
}

const view = (patch: Partial<JobView>): JobView => ({
  id: job.id,
  status: 'running',
  credit_pool: 'free',
  visibility: 'public',
  template_id: 'pure-white',
  credits_cost: 2,
  error_code: null,
  file_url: null,
  created_at: '',
  finished_at: null,
  ...patch,
})

describe('job model', () => {
  it('settles from the server view', () => {
    expect(applyView(job, view({})).status).toBe('running')
    const done = applyView(job, view({ status: 'succeeded', file_url: '/api/files/x', credit_pool: 'paid' }))
    expect(done).toMatchObject({ status: 'succeeded', fileUrl: '/api/files/x', creditPool: 'paid' })
    expect(applyView(job, view({ status: 'failed', error_code: 'CONTENT_REJECTED' })).failure?.code).toBe('CONTENT_REJECTED')
  })

  it('keeps whether credits came back from an error body', () => {
    expect(applyError(job, { code: 'GENERATION_FAILED', message: 'x', refunded: true }).failure).toEqual({ code: 'GENERATION_FAILED', message: 'x', refunded: true })
    expect(applyError(job, { code: 'RATE_LIMITED' }).failure?.refunded).toBeNull()
  })

  it('persists running jobs without the tab-only preview and drops stale ones', () => {
    const raw = serialize([job, { ...job, id: 'done', status: 'succeeded' }])
    const back = restore(raw, 2_000)
    expect(back).toHaveLength(1)
    expect(back[0]).not.toHaveProperty('previewUrl')
    expect(restore(raw, 1_000 + 7 * 60_000)).toEqual([])
    expect(restore('not json', 0)).toEqual([])
  })
})
