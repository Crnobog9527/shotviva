import { describe, expect, it, vi } from 'vitest'

import type { IdentityJudge } from './judge'
import { IDENTITY_JUDGE_TIMEOUT_MS, isRetryable, JudgeFailure, judgeWithRetry } from './judge-call'

const ok = { identitySwap: true, usage: { inputTokens: 270, outputTokens: 14 } }

function judgeOf(...steps: ('ok' | 'hang' | Error)[]) {
  const judge = vi.fn<IdentityJudge['judge']>(async () => {
    const step = steps[Math.min(judge.mock.calls.length - 1, steps.length - 1)]
    if (step === 'hang') return new Promise<never>(() => {})
    if (step instanceof Error) throw step
    return ok
  })
  return { tag: 'fake/luna', judge } satisfies IdentityJudge
}

describe('judgeWithRetry (#317 follow-up)', () => {
  it('waits 5 seconds per attempt', () => {
    expect(IDENTITY_JUDGE_TIMEOUT_MS).toBe(5_000)
  })

  it('answers on the first attempt when it can', async () => {
    const fake = judgeOf('ok')
    expect(await judgeWithRetry(fake, 'x', 20)).toEqual({ answer: ok, attempts: 1 })
  })

  it('tries once more after a timeout or a 5xx', async () => {
    const timedOut = judgeOf('hang', 'ok')
    expect(await judgeWithRetry(timedOut, 'x', 20)).toEqual({ answer: ok, attempts: 2 })
    const unavailable = judgeOf(new Error('openai responses 503'), 'ok')
    expect(await judgeWithRetry(unavailable, 'x', 20)).toEqual({ answer: ok, attempts: 2 })
  })

  it('gives up after two attempts, saying how many were made', async () => {
    const fake = judgeOf('hang')
    const error = (await judgeWithRetry(fake, 'x', 20).catch((e: unknown) => e)) as JudgeFailure
    expect(error).toBeInstanceOf(JudgeFailure)
    expect(error.attempts).toBe(2)
    expect(fake.judge).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx or an unreadable answer', async () => {
    for (const cause of [new Error('openai responses 400'), new Error('openai responses returned no output_text')]) {
      const fake = judgeOf(cause)
      expect(((await judgeWithRetry(fake, 'x', 20).catch((e: unknown) => e)) as JudgeFailure).attempts).toBe(1)
      expect(fake.judge).toHaveBeenCalledTimes(1)
    }
  })

  it('treats timeouts, 5xx and dropped connections as retryable', () => {
    expect(isRetryable(new Error('identity judge exceeded 5000ms'))).toBe(true)
    expect(isRetryable(new Error('openai responses 502'))).toBe(true)
    expect(isRetryable(new TypeError('fetch failed'))).toBe(true)
    expect(isRetryable(new Error('openai responses 429'))).toBe(false)
  })
})
