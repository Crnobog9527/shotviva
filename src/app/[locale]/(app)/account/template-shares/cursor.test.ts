import { describe, expect, it } from 'vitest'

import { cursorOf, cursorParam } from './cursor'

describe('share links page cursor', () => {
  it('round-trips the exact created_at and id', () => {
    const share = { createdAt: '2026-11-22T04:57:51.123456+00:00', id: 'abc123def456' }
    expect(cursorOf(decodeURIComponent(cursorParam(share)))).toEqual(share)
  })

  it('ignores anything else', () => {
    for (const value of [undefined, ['x'], 'x', '2026-11-22T04:57:51Z~short', "2026-11-22T04:57:51Z~abc123def456'or"]) expect(cursorOf(value)).toBeUndefined()
  })
})
