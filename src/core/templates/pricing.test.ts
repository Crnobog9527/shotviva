import { describe, expect, it } from 'vitest'

import { creditsBelowFloor } from './pricing'

const FLOOR = { high: { '1k': 2, '2k': 4, '4k': 6 }, medium: { '1k': 1, '2k': 2, '4k': 3 } }

describe('creditsBelowFloor', () => {
  it('lists every resolution priced under the floor of the template quality', () => {
    expect(creditsBelowFloor('high', { '1k': 1, '2k': 4, '4k': 5 }, FLOOR)).toEqual([
      { resolution: '1k', floor: 2, given: 1 },
      { resolution: '4k', floor: 6, given: 5 },
    ])
  })

  it('allows the floor itself and anything above it', () => {
    expect(creditsBelowFloor('high', { '1k': 2, '2k': 9, '4k': 6 }, FLOOR)).toEqual([])
    expect(creditsBelowFloor('medium', { '1k': 1, '2k': 2, '4k': 3 }, FLOOR)).toEqual([])
  })
})

it('only exempts the approved quality, tier and exact price', () => {
  const floor = { ...FLOOR, approved: { quality: 'high' as const, costs: { '1k': 1, '2k': 2, '4k': 3 } } }
  expect(creditsBelowFloor('high', { '1k': 1, '2k': 3, '4k': 3 }, floor)).toEqual([{ resolution: '2k', floor: 4, given: 3 }])
  expect(creditsBelowFloor('medium', { '1k': 1, '2k': 1, '4k': 3 }, floor)).toEqual([{ resolution: '2k', floor: 2, given: 1 }])
})
