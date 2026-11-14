import { describe, expect, it } from 'vitest'

import { biggestDrop, stepsOf } from './steps'

describe('funnel steps', () => {
  it('gives each step its conversion from the step before', () => {
    expect(stepsOf({ visitors: 100, signups: 10, imaged: 6, imaged24h: 4, paid: 3 }).map((s) => s.conversion)).toEqual([null, 0.1, 0.6, 0.5])
  })

  it('names the lowest conversion as the biggest drop', () => {
    expect(biggestDrop(stepsOf({ visitors: 100, signups: 10, imaged: 6, imaged24h: 4, paid: 3 }))).toEqual({ from: 'visitors', to: 'signups', conversion: 0.1, lost: 90 })
  })

  it('compares across a missing visitor count', () => {
    expect(biggestDrop(stepsOf({ visitors: null, signups: 10, imaged: 8, imaged24h: 4, paid: 2 }))).toEqual({ from: 'imaged', to: 'paid', conversion: 0.25, lost: 6 })
  })

  it('shows no conversion above 100% and no drop without a loss', () => {
    const steps = stepsOf({ visitors: 3, signups: 5, imaged: 5, imaged24h: 5, paid: 6 })
    expect(steps.map((s) => s.conversion)).toEqual([null, null, 1, null])
    expect(biggestDrop(steps)).toBeNull()
  })
})
