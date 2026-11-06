import { describe, expect, it } from 'vitest'

import { retryTransient } from './users'

type Result = { error: { message: string } | null; n: number }

function sequence(errors: (string | null)[]) {
  let calls = 0
  const call = async (): Promise<Result> => {
    const message = errors[Math.min(calls, errors.length - 1)]
    calls++
    return { error: message ? { message } : null, n: calls }
  }
  return { call, calls: () => calls }
}

describe('retryTransient', () => {
  it('retries a timeout until it succeeds', async () => {
    const s = sequence(['Processing this request timed out, please retry after a moment.', null])
    const result = await retryTransient(s.call, 4, 0)
    expect(result.error).toBeNull()
    expect(s.calls()).toBe(2)
  })

  it('returns a non-transient error at once', async () => {
    const s = sequence(['User already registered'])
    expect((await retryTransient(s.call, 4, 0)).error?.message).toBe('User already registered')
    expect(s.calls()).toBe(1)
  })

  it('gives up after the last attempt', async () => {
    const s = sequence(['An unexpected error occurred'])
    expect((await retryTransient(s.call, 3, 0)).error).not.toBeNull()
    expect(s.calls()).toBe(3)
  })
})
