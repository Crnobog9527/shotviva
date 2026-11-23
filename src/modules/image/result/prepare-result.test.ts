import { describe, expect, it } from 'vitest'

import { SHARE_PNG_MAX_BYTES, shareAsServed } from './prepare-result'

describe('shareAsServed', () => {
  it('hands over an opaque PNG up to 8 MB as served', () => {
    expect(shareAsServed(true, 2_480_000, false)).toBe(true)
    expect(shareAsServed(true, SHARE_PNG_MAX_BYTES, false)).toBe(true)
  })
  it('flattens to JPEG when the PNG is larger, transparent, or not a PNG', () => {
    expect(shareAsServed(true, SHARE_PNG_MAX_BYTES + 1, false)).toBe(false)
    expect(shareAsServed(true, 1_000_000, true)).toBe(false)
    expect(shareAsServed(false, 1_000_000, false)).toBe(false)
  })
})
