import { describe, expect, it } from 'vitest'

import { beforeParam, parseBefore } from './cursor'

describe('the Share links cursor', () => {
  it('round-trips the database timestamp exactly and ignores anything else', () => {
    const share = { cursor: '2026-11-22T05:01:02.123456+00:00', id: 'b'.repeat(32) }
    expect(parseBefore(decodeURIComponent(beforeParam(share)))).toEqual({ at: share.cursor, id: share.id })
    expect(parseBefore('nope')).toBeUndefined()
    expect(parseBefore(['a', 'b'])).toBeUndefined()
  })
})
