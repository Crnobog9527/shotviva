import { describe, expect, it } from 'vitest'

import type { TrackedJob } from '../generation/job-model'
import { developingJob } from './pending-job'

const job = (id: string, status: TrackedJob['status']) => ({ id, status }) as TrackedJob

describe('developingJob', () => {
  it('is the workspace photo while it is queued or running', () => {
    expect(developingJob(['a'], [job('a', 'queued')])?.id).toBe('a')
    expect(developingJob(['a'], [job('b', 'running'), job('a', 'running')])?.id).toBe('a')
  })

  it('is nothing for the form, a settled photo, a batch or an unknown id', () => {
    expect(developingJob([], [job('a', 'running')])).toBeNull()
    expect(developingJob(['a'], [job('a', 'succeeded')])).toBeNull()
    expect(developingJob(['a'], [job('a', 'failed')])).toBeNull()
    expect(developingJob(['a', 'b'], [job('a', 'running'), job('b', 'queued')])).toBeNull()
    expect(developingJob(['a'], [])).toBeNull()
  })
})
