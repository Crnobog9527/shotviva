import { describe, expect, it } from 'vitest'

import { assertKeyMatchesEnvironment } from './stripe/client'
import { batchUpgrade, limitsFor, MAX_BATCH_SIZE, TIER_LIMITS, tierForBatch } from './tier-limits'

describe('TIER_LIMITS (ARCHITECTURE §6.2, one table)', () => {
  it('holds the numbers the spec fixes', () => {
    expect(TIER_LIMITS).toEqual({
      starter: { concurrency: 1, perWindow: 20, batchMax: 1, supportHours: 48 },
      pro: { concurrency: 3, perWindow: 40, batchMax: 10, supportHours: 48 },
      max: { concurrency: 6, perWindow: 80, batchMax: 30, supportHours: 24 },
    })
    expect(MAX_BATCH_SIZE).toBe(30)
  })

  it('treats no tier as Starter', () => {
    expect(limitsFor(null)).toBe(TIER_LIMITS.starter)
    expect(limitsFor('max').concurrency).toBe(6)
  })

  it('names the lowest tier a batch fits, and the next tier up for a bigger batch', () => {
    expect([tierForBatch(1), tierForBatch(2), tierForBatch(10), tierForBatch(11), tierForBatch(30), tierForBatch(31)]).toEqual([
      'starter',
      'pro',
      'pro',
      'max',
      'max',
      null,
    ])
    expect([batchUpgrade(null), batchUpgrade('starter'), batchUpgrade('pro'), batchUpgrade('max')]).toEqual(['pro', 'pro', 'max', null])
  })
})

describe('assertKeyMatchesEnvironment', () => {
  it('allows test keys anywhere and live keys only in production', () => {
    expect(() => assertKeyMatchesEnvironment('sk_test_x', 'preview')).not.toThrow()
    expect(() => assertKeyMatchesEnvironment('sk_test_x', undefined)).not.toThrow()
    expect(() => assertKeyMatchesEnvironment('sk_live_x', 'production')).not.toThrow()
    expect(() => assertKeyMatchesEnvironment('sk_live_x', 'preview')).toThrow(/live Stripe key/)
    expect(() => assertKeyMatchesEnvironment('rk_live_x', undefined)).toThrow(/live Stripe key/)
  })
})
