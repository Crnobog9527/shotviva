import { describe, expect, it } from 'vitest'

import { BASE_SUPPORT_REPLY_HOURS, limitsFor, TIER_LIMITS } from './tier-limits'

describe('support reply hours (ARCHITECTURE §6.2, T27b)', () => {
  it('is 48 hours for Starter, Pro and no tier, 24 for Max', () => {
    expect([TIER_LIMITS.starter, TIER_LIMITS.pro, TIER_LIMITS.max].map((limits) => limits.supportHours)).toEqual([48, 48, 24])
    expect(BASE_SUPPORT_REPLY_HOURS).toBe(48)
    expect(limitsFor(null).supportHours).toBe(48)
  })
})
