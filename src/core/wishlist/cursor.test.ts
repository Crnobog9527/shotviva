import { describe, expect, it } from 'vitest'

import { afterTime, afterVotes, decodeTimeCursor, decodeWallCursor, encodeCursor } from './cursor'

const ID = '7d1e2c3b-0000-4000-8000-000000000000'
const AT = '2026-11-05T17:44:26.101234+00:00'

describe('wishlist cursors', () => {
  it('round-trips wall and time cursors', () => {
    const wall = { s: 'live' as const, v: 4, c: AT, i: ID }
    expect(decodeWallCursor(encodeCursor(wall))).toEqual(wall)
    expect(decodeTimeCursor(encodeCursor({ c: AT, i: ID }))).toEqual({ c: AT, i: ID })
  })

  it('treats a missing, tampered or foreign cursor as the first page', () => {
    expect(decodeWallCursor(null)).toBeNull()
    expect(decodeWallCursor('not-base64-json')).toBeNull()
    expect(decodeWallCursor(encodeCursor({ c: AT, i: ID }))).toBeNull()
    expect(decodeWallCursor(encodeCursor({ s: 'pending', v: 1, c: AT, i: ID } as never))).toBeNull()
    expect(decodeTimeCursor(encodeCursor({ c: AT, i: 'x' } as never))).toBeNull()
  })

  it('builds keyset filters for the descending orders', () => {
    expect(afterVotes({ v: 3, c: AT, i: ID })).toBe(
      `votes_count.lt.3,and(votes_count.eq.3,created_at.lt."${AT}"),and(votes_count.eq.3,created_at.eq."${AT}",id.lt.${ID})`,
    )
    expect(afterTime({ c: AT, i: ID })).toBe(`created_at.lt."${AT}",and(created_at.eq."${AT}",id.lt.${ID})`)
  })
})
