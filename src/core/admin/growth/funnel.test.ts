import { describe, expect, it } from 'vitest'

import { averageOrder, biggestDrop, newUserSteps } from './funnel'
import { PEOPLE, PERIOD } from './test-fixtures'

describe('new-user funnel', () => {
  it('takes sign-ups, images and payments from the database and the rest from PostHog', () => {
    expect(newUserSteps(PERIOD, PEOPLE).map((s) => s.count)).toEqual([18, 14, 11, 5, 3, 2])
  })

  it('leaves the PostHog steps empty when PostHog could not be read', () => {
    expect(newUserSteps(PERIOD, null).map((s) => s.count)).toEqual([18, null, 11, null, null, 2])
  })

  it('names the step where most new users stopped', () => {
    expect(biggestDrop(newUserSteps(PERIOD, PEOPLE))).toEqual({ from: 'image', to: 'paywall', lost: 6 })
  })

  it('compares across a missing step instead of skipping the drop', () => {
    expect(biggestDrop(newUserSteps(PERIOD, null))).toEqual({ from: 'image', to: 'paid', lost: 9 })
  })

  it('ignores a step that holds more people than the one before it', () => {
    expect(biggestDrop([{ key: 'signup', count: 2 }, { key: 'upload', count: 3 }])).toBeNull()
  })
})

describe('average order', () => {
  it('divides net revenue by the USD orders only', () => {
    expect(averageOrder(PERIOD)).toBeCloseTo(59.8 / 3)
  })

  it('has no average without a USD order', () => {
    expect(averageOrder({ ...PERIOD, orders: { ...PERIOD.orders, total: 1, non_usd: 1 } })).toBeNull()
  })
})
