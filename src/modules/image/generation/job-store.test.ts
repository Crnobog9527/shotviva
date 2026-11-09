import { expect, it, vi } from 'vitest'

import { readJob, submitJob, type SubmitOutcome } from './job-api'
import { getJobs, pollRunning, startJob } from './job-store'

vi.mock('./job-api', () => ({ readJob: vi.fn(), submitJob: vi.fn() }))

it('waits for reservation and recovers a lost submit without sending the job twice', async () => {
  const post = Promise.withResolvers<SubmitOutcome>()
  vi.mocked(submitJob).mockReturnValue(post.promise)
  vi.mocked(readJob).mockResolvedValue('missing')
  vi.useFakeTimers()
  try {
    const id = startJob({
      templateId: 'food', templateName: 'Food', resolution: '1k', aspect: 'original',
      credits: 2, inputKey: 'inputs/qa/food.jpg',
      body: { template_id: 'food', input_key: 'inputs/qa/food.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' } },
    }, 1)
    vi.advanceTimersByTime(3_000)
    await pollRunning()
    expect(readJob).not.toHaveBeenCalled()

    vi.advanceTimersByTime(30_000)
    await pollRunning()
    expect(readJob).toHaveBeenCalledWith(id)
    expect(getJobs()[0]?.status).toBe('running')

    post.resolve({ kind: 'lost' })
    await post.promise
    await pollRunning()
    expect(getJobs()[0]?.status).toBe('failed')
    expect(submitJob).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})
