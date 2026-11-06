import { describe, expect, it } from 'vitest'

import { BASE_SUPPORT_REPLY_HOURS, supportHoursFor, TIER_SUPPORT_REPLY_HOURS } from './tier-limits'

describe('support reply hours (ARCHITECTURE §6.2, T27b)', () => {
  it('is 48 hours for Starter, Pro and no tier, 24 for Max', () => {
    expect(TIER_SUPPORT_REPLY_HOURS).toEqual({ starter: 48, pro: 48, max: 24 })
    expect(BASE_SUPPORT_REPLY_HOURS).toBe(48)
    expect([supportHoursFor(null), supportHoursFor('starter'), supportHoursFor('pro'), supportHoursFor('max')]).toEqual([48, 48, 48, 24])
  })
})
