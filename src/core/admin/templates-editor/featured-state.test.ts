import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'
import { canFeature, FEATURED_LIMIT, featuredIds, toggleFeatured } from './featured-state'

const make = (id: string, extra: Partial<AdminTemplate> = {}) =>
  ({ id, name: id, isActive: true, visibleIn: ['web'], featuredRank: null, ...extra }) as AdminTemplate

describe('home featured list (T53)', () => {
  it('reads the list in rank order', () => {
    expect(featuredIds([make('a', { featuredRank: 2 }), make('b'), make('c', { featuredRank: 1 })])).toEqual(['c', 'a'])
  })

  it('appends on, drops off', () => {
    expect(toggleFeatured(['a'], make('b'), true)).toEqual(['a', 'b'])
    expect(toggleFeatured(['a', 'b'], make('a'), false)).toEqual(['b'])
    expect(toggleFeatured(['a'], make('a'), true)).toBeNull()
  })

  it('refuses an unpublished or partner-only template, and a 13th one', () => {
    expect(canFeature(make('x', { isActive: false }))).toBe(false)
    expect(canFeature(make('x', { visibleIn: ['partner'] }))).toBe(false)
    expect(toggleFeatured([], make('x', { isActive: false }), true)).toBeNull()
    const full = Array.from({ length: FEATURED_LIMIT }, (_, i) => `t${i}`)
    expect(toggleFeatured(full, make('extra'), true)).toBeNull()
  })
})
