import { describe, expect, it } from 'vitest'

import type { TrackedJob } from './job-model'
import { newlySettled, refundKey, statusMap, titleCohort, withTitle } from './settle-events'

const job = (id: string, status: TrackedJob['status'], queuedAt = 0, settledAt?: number) => ({ id, status, queuedAt, settledAt }) as TrackedJob

describe('newlySettled', () => {
  it('announces only jobs that were developing at the last look', () => {
    const before = statusMap([job('a', 'running'), job('b', 'queued'), job('c', 'succeeded')])
    const now = [job('a', 'succeeded'), job('b', 'failed'), job('c', 'succeeded'), job('d', 'succeeded')]
    const news = newlySettled(before, now)
    expect(news.ready.map((item) => item.id)).toEqual(['a'])
    expect(news.failed.map((item) => item.id)).toEqual(['b'])
  })
})

describe('refundKey', () => {
  it('says refunded only when the server refunded, and on hold first', () => {
    expect(refundKey([{ code: 'X', message: '', refunded: true }])).toBe('refunded')
    expect(refundKey([{ code: 'X', message: '', refunded: true }, { code: 'X', message: '', refunded: false }])).toBe('onHold')
    expect(refundKey([{ code: 'X', message: '', refunded: null }, null])).toBe('notCharged')
  })
})

describe('title', () => {
  it('follows the jobs started since the oldest one still active', () => {
    const jobs = [job('old', 'succeeded', 1, 3), job('a', 'succeeded', 5, 20), job('b', 'running', 6), job('c', 'queued', 7)]
    expect(titleCohort(jobs).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(titleCohort([job('a', 'succeeded', 1, 2)])).toEqual([])
    expect(withTitle('Photos · Shotviva', '2/3 ready')).toBe('2/3 ready · Photos · Shotviva')
    expect(withTitle('Photos', null)).toBe('Photos')
  })
})
