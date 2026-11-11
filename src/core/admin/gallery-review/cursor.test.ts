import { describe, expect, it } from 'vitest'

import { afterFilter, decodeCursor, encodeCursor } from './cursor'

const id = '0b6f2f8e-6a3f-4c1e-9d55-1f2a3b4c5d6e'

describe('review cursor', () => {
  it('round-trips and normalises the timestamp', () => {
    const cursor = decodeCursor(encodeCursor({ at: '2026-11-11T10:00:00+00:00', id }))
    expect(cursor).toEqual({ at: '2026-11-11T10:00:00.000Z', id })
  })

  it.each([null, '', 'x', `nope|${id}`, '2026-11-11T10:00:00Z|not-a-uuid', `2026-11-11T10:00:00Z|${id}|x`])(
    'reads %o as the first page',
    (raw) => expect(decodeCursor(raw)).toBeNull(),
  )

  it('builds the keyset filter in either direction', () => {
    const cursor = { at: '2026-11-11T10:00:00.000Z', id }
    expect(afterFilter('created_at', cursor, true)).toBe(
      `created_at.gt.2026-11-11T10:00:00.000Z,and(created_at.eq.2026-11-11T10:00:00.000Z,id.gt.${id})`,
    )
    expect(afterFilter('moderated_at', cursor, false)).toContain('moderated_at.lt.')
  })
})
