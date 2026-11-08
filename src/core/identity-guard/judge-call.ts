import type { IdentityJudge, IdentityJudgeAnswer } from './judge'
import { IDENTITY_JUDGE_INSTRUCTIONS } from './question'

// One decision call with a deadline, and the one retry production makes. The first test-site run
// (#317) failed open on 2 of 96 sentences at 3 s; 5 s per attempt and a second attempt on a
// timeout, a 5xx or a dropped connection make that rare, and the request still goes through when
// both fail (fail open). A 4xx or an unreadable answer is not retried: it would fail again.

export const IDENTITY_JUDGE_TIMEOUT_MS = 5_000
export const IDENTITY_JUDGE_ATTEMPTS = 2

// Both attempts failed: the last error, and how many were made.
export class JudgeFailure extends Error {
  readonly attempts: number

  constructor(cause: unknown, attempts: number) {
    super(cause instanceof Error ? cause.message : 'identity judge failed', { cause })
    this.name = 'JudgeFailure'
    this.attempts = attempts
  }
}

const RETRYABLE = /exceeded \d+ms|responses 5\d\d|fetch failed|network|socket|ECONNRESET|ETIMEDOUT/i

export const isRetryable = (error: unknown) => error instanceof Error && RETRYABLE.test(error.message)

export async function judgeWithin(judge: IdentityJudge, text: string, ms: number): Promise<IdentityJudgeAnswer> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`identity judge exceeded ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([judge.judge({ text, instructions: IDENTITY_JUDGE_INSTRUCTIONS, signal: controller.signal }), deadline])
  } finally {
    clearTimeout(timer)
  }
}

// The answer and how many attempts it took, or a JudgeFailure.
export async function judgeWithRetry(judge: IdentityJudge, text: string, ms = IDENTITY_JUDGE_TIMEOUT_MS): Promise<{ answer: IdentityJudgeAnswer; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { answer: await judgeWithin(judge, text, ms), attempts: attempt }
    } catch (error) {
      if (attempt >= IDENTITY_JUDGE_ATTEMPTS || !isRetryable(error)) throw new JudgeFailure(error, attempt)
    }
  }
}
