import { describe, expect, it } from 'vitest'
import { tagList, toggleRange, validTags } from './selection'

describe('reference selection', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']

  it('adds a contiguous range in either direction without clearing other selections', () => {
    const selected = new Set(['a', 'd'])
    expect(toggleRange(selected, ids, 'b', 'd', true)).toEqual(new Set(['a', 'b', 'c', 'd']))
    expect(toggleRange(selected, ids, 'e', 'd', true)).toEqual(new Set(['a', 'd', 'e']))
    expect([...selected]).toEqual(['a', 'd'])
  })

  it('toggles just one image when the previous anchor is no longer listed', () => {
    const selected = new Set(['c'])
    expect(toggleRange(selected, ids, 'c', 'removed', true)).toEqual(new Set())
    expect(toggleRange(selected, ids, 'b', null, true)).toEqual(new Set(['b', 'c']))
  })

  it('matches the database tag count and length limits', () => {
    expect(validTags(['一'.repeat(64)])).toBe(true)
    expect(validTags(['一'.repeat(65)])).toBe(false)
    expect(validTags(Array.from({ length: 33 }, (_, index) => String(index)))).toBe(false)
  })

  it('accepts Chinese or English separators and discards duplicate and empty tags', () => {
    expect(tagList(' 暗调，中餐,暗调, ')).toEqual(['暗调', '中餐'])
  })
})
