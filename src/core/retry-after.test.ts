import { expect, it } from 'vitest'

import { retryDelayMs } from './retry-after'

it('spreads a 429 without Retry-After over 15–30 s', () => {
  expect(retryDelayMs(null, () => 0)).toBe(15_000)
  expect(retryDelayMs(null, () => 0.999)).toBeLessThan(30_000)
})

it('follows Retry-After seconds or a date, with up to 5 s spread, between 1 s and 2 min', () => {
  expect(retryDelayMs('10', () => 0)).toBe(10_000)
  expect(retryDelayMs('10', () => 0.5)).toBe(12_500)
  expect(retryDelayMs('900', () => 0)).toBe(120_000)
  expect(retryDelayMs(new Date(60_000).toUTCString(), () => 0, 0)).toBe(60_000)
  expect(retryDelayMs('soon', () => 0)).toBe(15_000)
})
