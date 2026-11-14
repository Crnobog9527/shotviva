import { describe, expect, it } from 'vitest'

import { combine, daysLeft, neededPerVariant, twoProportionP, verdictOf } from './results'
import type { VariantRow } from './schemas'

const variant = (id: number, control = false, archived = false): VariantRow => ({
  id, option_id: `o${id}`, label: `V${id}`, weight: 50, is_control: control, archived_at: archived ? '2026-11-14T00:00:00Z' : null, fallback_variant_id: archived ? 1 : null,
})
const db = (id: number, signups: number) => ({ variant_id: id, signups, first_generations: Math.floor(signups / 2), payments: 0, now_on: signups, moved: 0 })
const DAY = 24 * 60 * 60 * 1000
const start = '2026-11-01T00:00:00Z'

describe('combine', () => {
  it('joins database counts and visitors per variant and computes the goal rate', () => {
    const [control, art] = combine([variant(1, true), variant(2)], [db(1, 10), db(2, 5)], [{ variantId: 1, visitors: 200, movedIn: 0 }], 'signup')
    expect(control).toMatchObject({ visitors: 200, signups: 10, goal: 10, rate: 0.05 })
    expect(art).toMatchObject({ visitors: 0, goal: 5, rate: null })
  })

  it('keeps visitors unknown (not zero) when PostHog could not be read', () => {
    expect(combine([variant(1, true)], [], null, 'payment')[0]).toMatchObject({ visitors: null, rate: null, goal: 0 })
  })
})

describe('twoProportionP', () => {
  it('matches the textbook values', () => {
    // 50/1000 vs 80/1000: z ≈ 2.72, two-sided p ≈ 0.0065.
    expect(twoProportionP({ goal: 50, visitors: 1000 }, { goal: 80, visitors: 1000 })).toBeCloseTo(0.0065, 3)
    expect(twoProportionP({ goal: 5, visitors: 100 }, { goal: 5, visitors: 100 })).toBeCloseTo(1, 6)
  })
})

describe('verdictOf', () => {
  const rows = (controlVisitors: number, controlGoal: number, otherVisitors: number, otherGoal: number) =>
    combine([variant(1, true), variant(2)], [db(1, controlGoal), db(2, otherGoal)], [{ variantId: 1, visitors: controlVisitors, movedIn: 0 }, { variantId: 2, visitors: otherVisitors, movedIn: 0 }], 'signup')
  const now = Date.parse(start) + 10 * DAY

  it('never names a winner on a small sample, however big the gap', () => {
    expect(verdictOf(rows(40, 1, 40, 10), start, now).kind).toBe('not_enough')
  })

  it('says there is no clear difference when the test does not reach 95%', () => {
    expect(verdictOf(rows(1000, 50, 1000, 55), start, now).kind).toBe('no_difference')
  })

  it('names better and worse variants only with enough data and p < 0.05', () => {
    expect(verdictOf(rows(1000, 50, 1000, 80), start, now)).toEqual({ kind: 'difference', better: [2], worse: [] })
  })

  it('reports no visitors yet', () => {
    expect(verdictOf(rows(0, 0, 0, 0), start, now).kind).toBe('no_visitors')
  })
})

describe('estimate', () => {
  it('needs more visitors for rarer goals', () => {
    expect(neededPerVariant(0.05)).toBeGreaterThan(neededPerVariant(0.2) ?? 0)
    expect(neededPerVariant(0)).toBeNull()
  })

  it('projects the days left from the slowest variant’s pace, and 0 once there', () => {
    const rows = combine([variant(1, true), variant(2)], [db(1, 5), db(2, 5)], [{ variantId: 1, visitors: 100, movedIn: 0 }, { variantId: 2, visitors: 100, movedIn: 0 }], 'signup')
    const needed = neededPerVariant(0.05) ?? 0
    expect(daysLeft(rows, start, Date.parse(start) + 10 * DAY)).toBe(Math.ceil((needed - 100) / 10))
    expect(daysLeft(rows, null, Date.now())).toBeNull()
  })
})
