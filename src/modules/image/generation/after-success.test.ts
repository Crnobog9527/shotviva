import { describe, expect, it } from 'vitest'

import { anySucceeded } from './after-success'
import type { TrackedJob } from './job-model'

const job = (status: TrackedJob['status']) => ({ status }) as TrackedJob

describe('AfterSuccess gate', () => {
  it('opens only once a photo in this tab has succeeded', () => {
    expect(anySucceeded([])).toBe(false)
    expect(anySucceeded([job('running'), job('failed'), job('queued')])).toBe(false)
    expect(anySucceeded([job('failed'), job('succeeded')])).toBe(true)
  })
})
