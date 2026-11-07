import { describe, expect, it } from 'vitest'

import { isSpike, spikeAlert, spikeHour, tally } from './failure-spike'

const rows = (failed: number, succeeded: number, rejected = 0) => [
  ...Array.from({ length: failed }, () => ({ status: 'failed' as const, error_code: 'PROVIDER_FAILED' })),
  ...Array.from({ length: succeeded }, () => ({ status: 'succeeded' as const, error_code: null })),
  ...Array.from({ length: rejected }, () => ({ status: 'failed' as const, error_code: 'CONTENT_REJECTED' })),
]

describe('failure spike rule: ≥ 5 failed and ≥ 30% in the last 60 minutes', () => {
  it('needs both the count and the rate', () => {
    expect(isSpike(tally(rows(5, 11)))).toBe(true) // 5 / 16 = 31%
    expect(isSpike(tally(rows(5, 12)))).toBe(false) // 5 / 17 = 29%
    expect(isSpike(tally(rows(4, 0)))).toBe(false) // 100%, but only 4
    expect(isSpike({ failed: 0, total: 0 })).toBe(false)
  })

  it('does not count a declined photo or text as a failure', () => {
    expect(tally(rows(4, 2, 3))).toEqual({ failed: 4, total: 9 })
    expect(isSpike(tally(rows(4, 2, 3)))).toBe(false)
  })

  it('keys the alert by UTC hour, so one goes out per hour', () => {
    const now = new Date('2026-11-08T10:59:00Z')
    expect(spikeHour(now)).toBe('2026-11-08T10')
    expect(spikeAlert({ failed: 6, total: 10 }, now)).toEqual({ kind: 'generation_spike', failed: 6, total: 10, windowMinutes: 60, hour: '2026-11-08T10' })
  })
})
