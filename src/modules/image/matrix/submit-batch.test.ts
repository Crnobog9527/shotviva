import { describe, expect, it, vi } from 'vitest'

import { createSubmitLatch } from '../workspace/submit-latch'
import { submitBatch } from './submit-batch'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('submitBatch (Batch create Generate, #515 latch)', () => {
  it('sends one preflight for a double click', async () => {
    const latch = createSubmitLatch()
    const start = vi.fn(async () => ({ started: true }))
    const done = { refused: vi.fn(), started: vi.fn() }
    expect(submitBatch(latch, start, done)).toBe(true)
    expect(submitBatch(latch, start, done)).toBe(false)
    await flush()
    expect(start).toHaveBeenCalledTimes(1)
    expect(done.started).toHaveBeenCalledTimes(1)
    // Still held after the batch started: a late third press queues nothing either.
    expect(submitBatch(latch, start, done)).toBe(false)
  })

  it('gives the latch back after a refusal so the user can fix and press again', async () => {
    const latch = createSubmitLatch()
    const start = vi.fn(async () => ({ error: 'CREDITS_INSUFFICIENT' }))
    const done = { refused: vi.fn(), started: vi.fn() }
    submitBatch(latch, start, done)
    await flush()
    expect(done.refused).toHaveBeenCalledWith('CREDITS_INSUFFICIENT')
    expect(submitBatch(latch, start, done)).toBe(true)
  })

  it('gives the latch back when there was nothing to send', async () => {
    const latch = createSubmitLatch()
    const done = { refused: vi.fn(), started: vi.fn() }
    submitBatch(latch, async () => ({ started: false }), done)
    await flush()
    expect(done.started).not.toHaveBeenCalled()
    expect(latch.take()).toBe(true)
  })

  it('is free again once the form comes back for a new batch', async () => {
    const latch = createSubmitLatch()
    submitBatch(latch, async () => ({ started: true }), { refused: vi.fn(), started: vi.fn() })
    await flush()
    latch.reset()
    expect(submitBatch(latch, async () => ({ started: true }), { refused: vi.fn(), started: vi.fn() })).toBe(true)
  })
})
