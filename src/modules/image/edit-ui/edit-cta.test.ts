import { describe, expect, it } from 'vitest'

import { editCta } from './edit-cta'

// 1K is paid from free credits only, 2K / 4K from paid credits only (Owner 2026-11-23, 1996).
describe('editCta', () => {
  it('asks for paid credits first on 2K / 4K, whatever the field says', () => {
    expect(editCta({ paid: 0, free: 0 }, 2, '2k', '')).toEqual({ kind: 'get-credits', cost: 2, needed: 2 })
    expect(editCta({ paid: 1, free: 30 }, 4, '4k', 'Make it brighter')).toEqual({ kind: 'get-credits', cost: 4, needed: 3 })
  })

  it('says 1K uses free credits only when they are short, paid credits or not', () => {
    expect(editCta({ paid: 50, free: 1 }, 2, '1k', 'x')).toEqual({ kind: 'free-only', cost: 2 })
  })

  it('stays dim until there are words', () => {
    expect(editCta({ paid: 0, free: 6 }, 2, '1k', '   ')).toEqual({ kind: 'empty', cost: 2 })
  })

  it('generates from the pool the tier decides', () => {
    expect(editCta({ paid: 0, free: 6 }, 2, '1k', '沙发换成蓝色')).toEqual({ kind: 'generate', cost: 2, pool: 'free' })
    expect(editCta({ paid: 10, free: 6 }, 2, '1k', 'x')).toEqual({ kind: 'generate', cost: 2, pool: 'free' })
    expect(editCta({ paid: 10, free: 6 }, 2, '2k', 'x')).toEqual({ kind: 'generate', cost: 2, pool: 'paid' })
  })
})
