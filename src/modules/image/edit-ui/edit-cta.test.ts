import { describe, expect, it } from 'vitest'

import { editCta } from './edit-cta'

// An edit is exempt from the tier → pool rule (Owner 2026-11-23, 1996): paid first, then free,
// at any tier, as reserve_credits does for the edit template.
describe('editCta', () => {
  it('asks for credits first, whatever the field says', () => {
    expect(editCta({ paid: 0, free: 0 }, 2, '')).toEqual({ kind: 'get-credits', cost: 2, needed: 2 })
    expect(editCta({ paid: 1, free: 3 }, 4, 'Make it brighter')).toEqual({ kind: 'get-credits', cost: 4, needed: 3 })
  })

  it('stays dim until there are words', () => {
    expect(editCta({ paid: 0, free: 6 }, 2, '   ')).toEqual({ kind: 'empty', cost: 2 })
  })

  it('pays from paid credits first, then free credits, never the tier pool alone', () => {
    expect(editCta({ paid: 0, free: 15 }, 15, '沙发换成蓝色')).toEqual({ kind: 'generate', cost: 15, pool: 'free' })
    expect(editCta({ paid: 15, free: 15 }, 15, 'x')).toEqual({ kind: 'generate', cost: 15, pool: 'paid' })
    expect(editCta({ paid: 14, free: 15 }, 15, 'x')).toEqual({ kind: 'generate', cost: 15, pool: 'free' })
  })
})
