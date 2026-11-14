import { describe, expect, it } from 'vitest'

import type { TrackedJob } from '../generation/job-model'
import { isDeveloping, soleJob } from './pending-job'

const job = (id: string, status: TrackedJob['status']) => ({ id, status }) as TrackedJob

describe('soleJob', () => {
  it('is the workspace photo whatever its status, so the head stays when it fails at once', () => {
    expect(soleJob(['a'], [job('a', 'queued')])?.id).toBe('a')
    expect(soleJob(['a'], [job('b', 'running'), job('a', 'failed')])?.status).toBe('failed')
    expect(soleJob(['a'], [job('a', 'succeeded')])?.status).toBe('succeeded')
  })

  it('is nothing for a batch, an empty workspace or an id the store no longer has', () => {
    expect(soleJob(['a', 'b'], [job('a', 'running'), job('b', 'running')])).toBeNull()
    expect(soleJob([], [job('a', 'running')])).toBeNull()
    expect(soleJob(['gone'], [job('a', 'running')])).toBeNull()
  })
})

describe('isDeveloping', () => {
  it('is true only while the photo is queued or running', () => {
    expect(isDeveloping(job('a', 'queued'))).toBe(true)
    expect(isDeveloping(job('a', 'running'))).toBe(true)
    expect(isDeveloping(job('a', 'failed'))).toBe(false)
    expect(isDeveloping(job('a', 'succeeded'))).toBe(false)
  })
})
