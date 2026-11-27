import { expect, it } from 'vitest'

import type { Job } from '../jobs'
import { replayFailure } from './partner-generate'

const failed = (errorCode: string) => ({ id: 'job-1', status: 'failed', errorCode }) as unknown as Job

it('answers a replayed key of a job refunded at the model’s limit with RATE_LIMITED, as the first call did', () => {
  const failure = replayFailure(failed('PROVIDER_RATE_LIMITED'))
  expect(failure.toBody()).toMatchObject({ code: 'RATE_LIMITED', job_id: 'job-1', refunded: true })
  expect(failure.status).toBe(429)
  expect(failure.message).toContain('new Idempotency-Key')
})

it('keeps the other replay answers', () => {
  expect(replayFailure(failed('CONTENT_REJECTED')).code).toBe('CONTENT_REJECTED')
  expect(replayFailure(failed('PROVIDER_FAILED')).code).toBe('GENERATION_FAILED')
})
