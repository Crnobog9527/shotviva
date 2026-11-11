import { describe, expect, it } from 'vitest'

import { planBlocked, planFeaturedChange, type FeaturedCandidate } from './bulk-featured-rules'

const live = (id: string, over: Partial<FeaturedCandidate> = {}): FeaturedCandidate => ({ id, name: `Name ${id}`, isActive: true, visibleIn: ['web'], ...over })
const ids = (count: number) => Array.from({ length: count }, (_, i) => `f${i}`)

describe('planFeaturedChange', () => {
  it('appends the new ones in the order given (catalogue order) and skips those already in', () => {
    const plan = planFeaturedChange(['a', 'b'], [live('c'), live('a'), live('d')], true)
    expect(plan.next).toEqual(['a', 'b', 'c', 'd'])
    expect(plan.changed.map((item) => item.id)).toEqual(['c', 'd'])
    expect(plan.unchanged.map((item) => item.id)).toEqual(['a'])
    expect(planBlocked(plan)).toBe(false)
  })

  it('refuses unpublished, partner-only and deleted templates, and blocks the whole batch', () => {
    const plan = planFeaturedChange([], [live('a'), live('b', { isActive: false }), live('c', { visibleIn: ['partner'] }), { id: 'gone', name: 'gone', missing: true }], true)
    expect(plan.failures).toEqual([
      { id: 'b', name: 'Name b', reason: 'not_live' },
      { id: 'c', name: 'Name c', reason: 'not_live' },
      { id: 'gone', name: 'gone', reason: 'not_found' },
    ])
    expect(planBlocked(plan)).toBe(true)
  })

  it('counts how far past 12 the list would go', () => {
    const plan = planFeaturedChange(ids(11), [live('x'), live('y'), live('z')], true)
    expect(plan.next).toHaveLength(14)
    expect(plan.over).toBe(2)
    expect(planBlocked(plan)).toBe(true)
    expect(planBlocked(planFeaturedChange(ids(11), [live('x')], true))).toBe(false)
  })

  it('clearing keeps the order of the rest; a non-featured or unpublished pick is just unchanged', () => {
    const plan = planFeaturedChange(['a', 'b', 'c'], [live('b'), live('z', { isActive: false })], false)
    expect(plan.next).toEqual(['a', 'c'])
    expect(plan.changed.map((item) => item.id)).toEqual(['b'])
    expect(plan.unchanged.map((item) => item.id)).toEqual(['z'])
    expect(planBlocked(plan)).toBe(false)
  })
})
