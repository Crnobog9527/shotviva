import { describe, expect, it } from 'vitest'

import { chargePool, creditsNeeded } from './pools'

describe('chargePool', () => {
  it('takes the paid pool first and never splits a charge', () => {
    expect(chargePool({ paid: 4, free: 6 }, 4)).toBe('paid')
    expect(chargePool({ paid: 3, free: 6 }, 4)).toBe('free')
    expect(chargePool({ paid: 3, free: 3 }, 4)).toBeNull()
  })
})

describe('creditsNeeded', () => {
  it('is zero when a pool covers the cost', () => {
    expect(creditsNeeded({ paid: 0, free: 6 }, 2)).toBe(0)
  })

  it('counts the paid credits to buy, since purchases only fill the paid pool', () => {
    expect(creditsNeeded({ paid: 0, free: 2 }, 6)).toBe(6)
    expect(creditsNeeded({ paid: 1, free: 0 }, 4)).toBe(3)
  })
})
