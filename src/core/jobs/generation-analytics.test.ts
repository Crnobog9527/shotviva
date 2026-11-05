import { describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '../analytics'
import { AppError } from '../errors'
import { generateEventProps, settleTracked } from './generation-analytics'
import { GenerationFailure } from './generation-failure'
import type { Job } from './job-schema'

const job: Job = {
  id: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000001',
  module: 'image',
  templateId: 'ramen-studio',
  inputs: { copy: { dish: 'tonkotsu ramen' }, input_key: 'inputs/u/k.jpg', resolution: '2k' },
  provider: 'openai',
  source: 'web',
  idempotencyKey: null,
  status: 'running',
  creditPool: 'free',
  visibility: 'public',
  creditsCost: 4,
  outputKey: null,
  errorCode: null,
  createdAt: new Date(),
  finishedAt: null,
}

describe('generateEventProps', () => {
  it('maps a job to the dictionary and never copies its user inputs', () => {
    const props = generateEventProps(job, 'food', { status: 'succeeded' }, 1234.6)
    expect(props).toEqual({
      template_id: 'ramen-studio',
      category: 'food',
      resolution: '2k',
      credits_cost: 4,
      credit_pool: 'free',
      status: 'succeeded',
      error_code: null,
      source: 'web',
      duration_ms: 1235,
    })
  })

  it('treats a job without a resolution (pre-T16) as 1K', () => {
    expect(generateEventProps({ ...job, inputs: {} }, 'food', { status: 'succeeded' }, 0).resolution).toBe('1k')
  })
})

describe('settleTracked', () => {
  const clock = () => {
    let t = 1_000
    return () => (t += 500)
  }

  it('sends one succeeded event per settled job', async () => {
    const track = vi.fn<ServerTrack>()
    await expect(settleTracked(job, 'food', async () => 'done', { track, now: clock() })).resolves.toBe('done')
    expect(track).toHaveBeenCalledExactlyOnceWith(
      'generate',
      expect.objectContaining({ status: 'succeeded', duration_ms: 500 }),
      { distinctId: job.userId },
    )
  })

  it('sends a failed event with the job error code and rethrows', async () => {
    const track = vi.fn<ServerTrack>()
    const failure = new GenerationFailure(new AppError('GENERATION_FAILED', 'x'), job.id, true, 'PROVIDER_TIMEOUT')
    await expect(settleTracked(job, 'food', () => Promise.reject(failure), { track })).rejects.toBe(failure)
    expect(track).toHaveBeenCalledWith('generate', expect.objectContaining({ status: 'failed', error_code: 'PROVIDER_TIMEOUT' }), {
      distinctId: job.userId,
    })
  })
})
