import { describe, expect, it } from 'vitest'

import { creditMinimum, creditsBelowFloor, MISSING_COST } from './pricing'

const FLOOR = { high: { '1k': 2, '2k': 4, '3k': 6 }, medium: { '1k': 1, '2k': 2, '3k': 3 } }

describe('creditsBelowFloor', () => {
  it('lists every resolution priced under the floor of the template quality', () => {
    expect(creditsBelowFloor('high', { '1k': 1, '2k': 4, '3k': 5 }, FLOOR)).toEqual([
      { resolution: '1k', floor: 2, given: 1 },
      { resolution: '3k', floor: 6, given: 5 },
    ])
  })

  it('allows the floor itself and anything above it', () => {
    expect(creditsBelowFloor('high', { '1k': 2, '2k': 9, '3k': 6 }, FLOOR)).toEqual([])
    expect(creditsBelowFloor('medium', { '1k': 1, '2k': 2, '3k': 3 }, FLOOR)).toEqual([])
  })
})

it('only exempts the approved quality, tier and exact price', () => {
  const floor = { ...FLOOR, approved: { quality: 'high' as const, costs: { '1k': 1, '2k': 2, '3k': 3 } } }
  expect(creditsBelowFloor('high', { '1k': 1, '2k': 3, '3k': 3 }, floor)).toEqual([{ resolution: '2k', floor: 4, given: 3 }])
  expect(creditsBelowFloor('medium', { '1k': 1, '2k': 1, '3k': 3 }, floor)).toEqual([{ resolution: '2k', floor: 2, given: 1 }])
})

describe('slot templates (§5.1e, migration 1310)', () => {
  const floor = { high: { '1k': 4, '2k': 8, '3k': 12 }, medium: { '1k': 2, '2k': 4, '3k': 6 } }
  const cost = { '1k': 10, '2k': 20, '3k': 30 }

  it('multiplies only the route floor by the slots', () => {
    expect(creditMinimum(floor, 'high', '1k', 3)).toBe(12)
    // The template's own tariff is not multiplied, as in SQL.
    expect(creditMinimum({ ...floor, tariff: { quality: 'high', costs: { '1k': 20, '2k': 20, '3k': 20 } } }, 'high', '1k', 3)).toBe(20)
    expect(creditsBelowFloor('high', cost, floor, [], 3).map((v) => [v.resolution, v.floor])).toEqual([['1k', 12], ['2k', 24], ['3k', 36]])
    expect(creditsBelowFloor('high', cost, floor, [], 1)).toEqual([])
  })

  it('never multiplies the missing-cost sentinel', () => {
    const missing = { ...floor, high: { '1k': MISSING_COST, '2k': 8, '3k': 12 } }
    expect(creditMinimum(missing, 'high', '1k', 4)).toBe(MISSING_COST)
    expect(creditsBelowFloor('high', cost, missing, [], 4)[0]).toMatchObject({ resolution: '1k', floor: MISSING_COST })
  })
})
