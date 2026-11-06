import { describe, expect, it } from 'vitest'

import type { TrackedJob } from './job-model'
import { nextToSend } from './scheduler'
import { decodeState, encodeState } from './store-persistence'

// Owner's phone test (PR #51): refreshing while a photo developed dropped the workspace back to
// the form. The workspace's jobs now ride in the stored state, so a refresh restores the same
// developing view, and the result once it settles, for one photo and for a batch.

const body = { template_id: 'pure-white', input_key: 'inputs/u/a.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' }, batch_size: 1 }

const job = (id: string, patch: Partial<TrackedJob> = {}): TrackedJob => ({
  id,
  templateId: 'pure-white',
  templateName: 'Pure White',
  resolution: '1k',
  aspect: 'original',
  credits: 2,
  inputKey: `inputs/u/${id}.jpg`,
  batchSize: 1,
  queuedAt: 1_000,
  startedAt: 1_000,
  sentAt: 1_000,
  status: 'running',
  body,
  fileUrl: null,
  creditPool: null,
  failure: null,
  previewUrl: `blob:${id}`,
  ...patch,
})

const reload = (jobs: TrackedJob[], views: Record<string, string[]>, now = 5_000) => decodeState(encodeState({ limit: 3, jobs, views }), now)

describe('workspace views across a refresh', () => {
  it('brings back a single developing photo for its template, ready to be sent again', () => {
    const back = reload([job('a')], { 'pure-white': ['a'] })
    expect(back.views).toEqual({ 'pure-white': ['a'] })
    expect(back.jobs[0]).toMatchObject({ id: 'a', status: 'queued', startedAt: 1_000 })
    expect(back.jobs[0]).not.toHaveProperty('previewUrl')
    expect(nextToSend(back.jobs, back.limit, 5_000)).toEqual(['a'])
  })

  it('keeps a finished photo the workspace is showing, so the result comes back', () => {
    const done = job('a', { status: 'succeeded', fileUrl: '/api/files/a', creditPool: 'paid', settledAt: 4_000 })
    const back = reload([done], { 'pure-white': ['a'] })
    expect(back.views['pure-white']).toEqual(['a'])
    expect(back.jobs[0]).toMatchObject({ status: 'succeeded', fileUrl: '/api/files/a' })
  })

  it('brings back a batch in its order, settled and unsettled rows alike', () => {
    const jobs = [
      job('c', { status: 'queued', startedAt: 0, sentAt: undefined, batchSize: 3 }),
      job('b', { batchSize: 3 }),
      job('a', { status: 'failed', failure: { code: 'PROVIDER_FAILED', message: '', refunded: true }, settledAt: 4_000, batchSize: 3 }),
    ]
    const back = reload(jobs, { 'pure-white': ['a', 'b', 'c'] })
    expect(back.views['pure-white']).toEqual(['a', 'b', 'c'])
    expect(back.jobs.map((restored) => [restored.id, restored.status])).toEqual([
      ['c', 'queued'],
      ['b', 'queued'],
      ['a', 'failed'],
    ])
    // The failed row keeps its request, so Retry still works after the refresh.
    expect(back.jobs.find((restored) => restored.id === 'a')?.body).toEqual(body)
  })

  it('does not keep settled jobs no workspace is showing', () => {
    const done = job('a', { status: 'succeeded', fileUrl: '/api/files/a', settledAt: 4_000 })
    expect(reload([done], {}).jobs).toEqual([])
  })

  it('drops a view whose jobs are all gone (stale), so the form shows', () => {
    const old = job('a', { status: 'succeeded', fileUrl: '/api/files/a', settledAt: 1_000 })
    const back = reload([old], { 'pure-white': ['a'] }, 1_000 + 31 * 60_000)
    expect(back.jobs).toEqual([])
    expect(back.views).toEqual({})
  })

  it('reads the pre-T28 bare array and anything unreadable as no views', () => {
    expect(decodeState(JSON.stringify([job('a', { body: undefined })]), 5_000)).toMatchObject({ limit: 1, views: {} })
    expect(decodeState('not json', 0)).toEqual({ limit: 1, jobs: [], views: {} })
    expect(decodeState(null, 0).jobs).toEqual([])
  })
})
