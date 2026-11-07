import { describe, expect, it, vi } from 'vitest'

import { createBackoff } from './backoff'
import { schedule } from './schedule'

const MINUTE = 60_000

describe('createBackoff', () => {
  it('pauses 1 minute after a failure, doubling to 30 minutes, and resets on success', () => {
    const backoff = createBackoff()
    expect(backoff.paused(0)).toBe(false)
    backoff.failed(0)
    expect(backoff.paused(MINUTE - 1)).toBe(true)
    expect(backoff.paused(MINUTE)).toBe(false)
    backoff.failed(MINUTE)
    expect(backoff.paused(3 * MINUTE - 1)).toBe(true)
    for (let i = 0; i < 10; i += 1) backoff.failed(0)
    expect(backoff.paused(30 * MINUTE - 1)).toBe(true)
    expect(backoff.paused(30 * MINUTE)).toBe(false)
    backoff.succeeded()
    expect(backoff.paused(1)).toBe(false)
  })
})

describe('schedule', () => {
  it('returns at once, runs the work outside a request scope, and swallows its failure', async () => {
    const work = vi.fn(async () => {
      throw new Error('feishu down')
    })
    expect(() => schedule(work)).not.toThrow()
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1))
  })
})
