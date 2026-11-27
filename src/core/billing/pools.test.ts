import { describe, expect, it } from 'vitest'

import { chargePool, creditsNeeded, defaultTier, tierPool } from './pools'

// The tier decides the pool (Owner 2026-11-23, migration 1996): 1K free only, 2K / 4K paid only.
describe('chargePool', () => {
  it('charges the tier’s own pool and never the other one, never split', () => {
    expect(chargePool({ paid: 4, free: 6 }, 4, '2k')).toBe('paid')
    expect(chargePool({ paid: 4, free: 6 }, 4, '1k')).toBe('free')
    expect(chargePool({ paid: 3, free: 6 }, 4, '4k')).toBeNull() // free credits never pay 2K / 4K
    expect(chargePool({ paid: 60, free: 3 }, 4, '1k')).toBeNull() // paid credits never pay 1K
    expect(tierPool('1k')).toBe('free')
  })
})

describe('creditsNeeded', () => {
  it('is zero when the tier’s pool covers the cost', () => {
    expect(creditsNeeded({ paid: 2, free: 0 }, 2, '2k')).toBe(0)
  })

  it('counts the paid credits to buy for 2K / 4K, since purchases only fill the paid pool', () => {
    expect(creditsNeeded({ paid: 0, free: 20 }, 6, '2k')).toBe(6)
    expect(creditsNeeded({ paid: 1, free: 0 }, 4, '4k')).toBe(3)
  })

  it('is zero for 1K: buying never pays it', () => {
    expect(creditsNeeded({ paid: 0, free: 0 }, 6, '1k')).toBe(0)
  })
})

describe('defaultTier', () => {
  it('prefers 2K on paid credits, then 1K on free credits', () => {
    expect(defaultTier({ paid: 5, free: 0 }, { '1k': 5, '2k': 5 }, ['1k', '2k'])).toBe('2k')
    expect(defaultTier({ paid: 4, free: 5 }, { '1k': 5, '2k': 5 }, ['1k', '2k'])).toBe('1k')
    expect(defaultTier({ paid: 0, free: 0 }, { '1k': 5, '2k': 5 }, ['1k', '2k'])).toBeNull()
  })
})
