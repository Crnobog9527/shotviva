import { expect, it, vi } from 'vitest'

import { readJobs, submitJob, type SubmitOutcome } from './job-api'
import { getJobs, pollRunning, startJob } from './job-store'

vi.mock('./job-api', () => ({ readJobs: vi.fn(), submitJob: vi.fn() }))

it('waits for reservation and recovers a lost submit without sending the job twice', async () => {
  const post = Promise.withResolvers<SubmitOutcome>()
  vi.mocked(submitJob).mockReturnValue(post.promise)
  vi.mocked(readJobs).mockImplementation(async (ids) => new Map(ids.map((id) => [id, 'missing' as const])))
  vi.useFakeTimers()
  try {
    const id = startJob({
      templateId: 'food', templateName: 'Food', resolution: '1k', aspect: 'original',
      credits: 2, inputKey: 'inputs/qa/food.jpg',
      body: { template_id: 'food', input_key: 'inputs/qa/food.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' } },
    }, 1)
    vi.advanceTimersByTime(3_000)
    await pollRunning()
    expect(readJobs).not.toHaveBeenCalled()

    vi.advanceTimersByTime(30_000)
    await pollRunning()
    expect(readJobs).toHaveBeenCalledWith([id])
    expect(getJobs()[0]?.status).toBe('running')

    post.resolve({ kind: 'lost' })
    await post.promise
    vi.advanceTimersByTime(3_000)
    await pollRunning()
    expect(getJobs()[0]?.status).toBe('failed')
    expect(submitJob).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})

it('puts a photo the firewall turned away back in line instead of failing it', async () => {
  vi.mocked(submitJob).mockResolvedValueOnce({ kind: 'limited', retryAfterMs: 20_000 })
  const id = startJob({
    templateId: 'food', templateName: 'Food', resolution: '1k', aspect: 'original',
    credits: 2, inputKey: 'inputs/qa/food2.jpg',
    body: { template_id: 'food', input_key: 'inputs/qa/food2.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' } },
  }, 1)
  await vi.waitFor(() => expect(getJobs().find((job) => job.id === id)?.status).toBe('queued'))
  const job = getJobs().find((candidate) => candidate.id === id)
  expect(job?.failure).toBeNull()
  expect((job?.retryAt ?? 0) - Date.now()).toBeGreaterThan(15_000)
})

it('sends a photo the provider refused at its limit again under a new id', async () => {
  vi.mocked(submitJob).mockResolvedValueOnce({ kind: 'limited', retryAfterMs: 20_000, settled: true })
  const id = startJob({
    templateId: 'food', templateName: 'Food', resolution: '1k', aspect: 'original',
    credits: 2, inputKey: 'inputs/qa/food3.jpg',
    body: { template_id: 'food', input_key: 'inputs/qa/food3.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' } },
  }, 1)
  await vi.waitFor(() => expect(getJobs().some((job) => job.id === id)).toBe(false))
  const next = getJobs().find((job) => job.inputKey === 'inputs/qa/food3.jpg')
  expect(next).toMatchObject({ status: 'queued', failure: null })
  expect(next?.id).not.toBe(id)
})
