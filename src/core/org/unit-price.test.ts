import { describe, expect, it } from 'vitest'

import { unitPricePer100Credits } from './unit-price'

describe('unitPricePer100Credits', () => {
  it('shows two decimals when they lose nothing', () => {
    expect(unitPricePer100Credits(500000, 833333)).toBe('0.60')
    expect(unitPricePer100Credits(10000, 10000)).toBe('1.00')
    expect(unitPricePer100Credits(1000, 400)).toBe('2.50')
  })
  it('shows three decimals when two would round a non-zero digit away', () => {
    expect(unitPricePer100Credits(1000, 3000)).toBe('0.333')
    expect(unitPricePer100Credits(7, 1000)).toBe('0.007')
    expect(unitPricePer100Credits(1234, 1000)).toBe('1.234')
  })
  it('rounds at the third decimal', () => {
    expect(unitPricePer100Credits(2000, 3000)).toBe('0.667')
  })
  it('has no price without credits or with bad numbers', () => {
    expect(unitPricePer100Credits(100, 0)).toBeNull()
    expect(unitPricePer100Credits(100, -5)).toBeNull()
    expect(unitPricePer100Credits(Number.NaN, 10)).toBeNull()
    expect(unitPricePer100Credits(-1, 10)).toBeNull()
  })
})
