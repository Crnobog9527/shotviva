import { describe, expect, it } from 'vitest'

import { workTagKey } from './work-tag'

// ARCHITECTURE §9 第 7 条 (migration 1320): a free work is public with a watermark, except a
// poster work, which is private (still watermarked); paid works say what they are.
describe('workTagKey', () => {
  it('names each pool and visibility', () => {
    expect(workTagKey('free', 'public')).toBe('freePublic')
    expect(workTagKey('free', 'private')).toBe('freePrivate')
    expect(workTagKey('paid', 'private')).toBe('private')
    expect(workTagKey('paid', 'public')).toBe('public')
  })
})
