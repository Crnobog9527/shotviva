import { describe, expect, it } from 'vitest'

import { TIER_LIMITS } from '../billing/tier-limits'
import { RATE_LIMIT, countsAgainst, rateLimitVerdict } from './rate-limit'

const now = new Date('2026-11-05T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const limits = (concurrency: number, perWindow = 20) => ({ concurrency, perWindow })
const finished = (count: number) => Array.from({ length: count }, () => ({ status: 'failed', created_at: ago(60_000) }))

describe('rateLimitVerdict', () => {
  it('allows a quiet account', () => {
    expect(rateLimitVerdict([{ status: 'succeeded', created_at: ago(1000) }], now, limits(1))).toBe('ok')
  })

  it('caps jobs in flight at the per-account limit', () => {
    const running = Array.from({ length: 6 }, () => ({ status: 'running', created_at: ago(5000) }))
    expect(rateLimitVerdict(running, now, limits(6))).toBe('too_many_running')
    expect(rateLimitVerdict(running.slice(1), now, limits(6))).toBe('ok')
  })

  it('takes the per-account limit when given one', () => {
    const one = [{ status: 'running', created_at: ago(5000) }]
    expect(rateLimitVerdict(one, now, limits(1))).toBe('too_many_running')
    expect(rateLimitVerdict(one, now, limits(3))).toBe('ok')
  })

  it('ignores running jobs whose function must already have died', () => {
    const stale = Array.from({ length: 5 }, () => ({ status: 'running', created_at: ago(RATE_LIMIT.RUNNING_STALE_MS + 1) }))
    expect(rateLimitVerdict(stale, now, limits(1))).toBe('ok')
  })

  it('caps jobs per window at the tier perWindow: Starter 20, Pro 40, Max 80', () => {
    for (const tier of ['starter', 'pro', 'max'] as const) {
      const { perWindow } = TIER_LIMITS[tier]
      expect(rateLimitVerdict(finished(perWindow - 1), now, TIER_LIMITS[tier])).toBe('ok')
      expect(rateLimitVerdict(finished(perWindow), now, TIER_LIMITS[tier])).toBe('too_many_recent')
    }
  })

  it('lets a Max batch of 30 through where Starter stops at 20', () => {
    expect(rateLimitVerdict(finished(25), now, TIER_LIMITS.max)).toBe('ok')
    expect(rateLimitVerdict(finished(25), now, TIER_LIMITS.starter)).toBe('too_many_recent')
  })
})

describe('countsAgainst', () => {
  const job = { id: 'job-1', idempotency_key: 'call-1' }

  it('skips the replayed job, matched by id or by Idempotency-Key', () => {
    expect(countsAgainst(job, { jobId: 'job-1' })).toBe(false)
    expect(countsAgainst(job, { idempotencyKey: 'call-1' })).toBe(false)
  })

  it('counts every other job, and every job for a request that names none', () => {
    expect(countsAgainst(job, { jobId: 'job-2', idempotencyKey: 'call-2' })).toBe(true)
    expect(countsAgainst({ id: 'job-3', idempotency_key: null }, { idempotencyKey: null })).toBe(true)
    expect(countsAgainst(job, {})).toBe(true)
  })
})
