import { describe, expect, it } from 'vitest'

import { editCta } from './edit-cta'

describe('editCta', () => {
  it('asks for credits first, whatever the field says', () => {
    expect(editCta({ paid: 0, free: 0 }, 2, '')).toEqual({ kind: 'get-credits', cost: 2, needed: 2 })
    expect(editCta({ paid: 1, free: 3 }, 4, 'Make it brighter')).toEqual({ kind: 'get-credits', cost: 4, needed: 3 })
  })

  it('stays dim until there are words', () => {
    expect(editCta({ paid: 0, free: 6 }, 2, '   ')).toEqual({ kind: 'empty', cost: 2 })
  })

  it('generates from the pool reserve_credits would use', () => {
    expect(editCta({ paid: 0, free: 6 }, 2, '沙发换成蓝色')).toEqual({ kind: 'generate', cost: 2, pool: 'free' })
    expect(editCta({ paid: 10, free: 6 }, 2, 'x')).toEqual({ kind: 'generate', cost: 2, pool: 'paid' })
  })
})
