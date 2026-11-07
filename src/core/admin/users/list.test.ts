import { describe, expect, it } from 'vitest'

import { planInterval } from './list'

describe('planInterval (T77)', () => {
  it('reads monthly or yearly off the product id', () => {
    expect(planInterval('starter_monthly')).toBe('month')
    expect(planInterval('max_yearly')).toBe('year')
    expect(planInterval('pack_100')).toBeNull()
    expect(planInterval(null)).toBeNull()
  })
})
