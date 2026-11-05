import { describe, expect, it } from 'vitest'

import { RATE_LIMIT, rateLimitVerdict } from './rate-limit'

const now = new Date('2026-11-05T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('rateLimitVerdict', () => {
  it('allows a quiet account', () => {
    expect(rateLimitVerdict([{ status: 'succeeded', created_at: ago(1000) }], now, 1)).toBe('ok')
  })

  it('caps jobs in flight at the per-account limit', () => {
    const running = Array.from({ length: 6 }, () => ({ status: 'running', created_at: ago(5000) }))
    expect(rateLimitVerdict(running, now, 6)).toBe('too_many_running')
    expect(rateLimitVerdict(running.slice(1), now, 6)).toBe('ok')
  })

  it('takes the per-account limit when given one', () => {
    const one = [{ status: 'running', created_at: ago(5000) }]
    expect(rateLimitVerdict(one, now, 1)).toBe('too_many_running')
    expect(rateLimitVerdict(one, now, 3)).toBe('ok')
  })

  it('ignores running jobs whose function must already have died', () => {
    const stale = Array.from({ length: 5 }, () => ({ status: 'running', created_at: ago(RATE_LIMIT.RUNNING_STALE_MS + 1) }))
    expect(rateLimitVerdict(stale, now, 1)).toBe('ok')
  })

  it('caps jobs per window', () => {
    const recent = Array.from({ length: RATE_LIMIT.MAX_PER_WINDOW }, () => ({ status: 'failed', created_at: ago(60_000) }))
    expect(rateLimitVerdict(recent, now, 1)).toBe('too_many_recent')
  })
})
