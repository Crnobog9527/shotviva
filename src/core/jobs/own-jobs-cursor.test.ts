import { describe, expect, it } from 'vitest'

import { decodeOwnJobsCursor, encodeOwnJobsCursor } from './own-jobs'

describe('Photos page cursor', () => {
  const cursor = { createdAt: '2026-11-27T10:00:00.123456+00:00', id: '1f0c1c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' }

  it('round-trips the raw timestamp with its microseconds', () => {
    const value = encodeOwnJobsCursor(cursor)
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeOwnJobsCursor(value)).toEqual(cursor)
  })

  it('reads anything else as no cursor', () => {
    const enc = (text: string) => Buffer.from(text).toString('base64url')
    for (const value of [undefined, '', 'x', enc('2026-11-27|nope'), enc(`not-a-date|${cursor.id}`), enc(`${cursor.createdAt}|${cursor.id}|x`), enc(`${cursor.createdAt}),id.gt.0|${cursor.id}`), 'a'.repeat(300)]) {
      expect(decodeOwnJobsCursor(value)).toBeNull()
    }
  })
})
