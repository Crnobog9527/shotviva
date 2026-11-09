import { describe, expect, it } from 'vitest'

import { isIosBrowser } from './ios-browser'

describe('iOS and iPadOS photo actions', () => {
  it.each([
    ['iPhone; Safari', 5, true],
    ['iPhone; CriOS', 5, true],
    ['iPad; Safari', 5, true],
    ['iPad; CriOS', 5, true],
    ['iPod touch; Safari', 5, true],
    ['Macintosh; Safari', 5, true],
    ['Macintosh; Chrome', 0, false],
    ['Android; Chrome Mobile', 5, false],
  ] as const)('detects %s with %i touch points', (userAgent, maxTouchPoints, expected) => {
    expect(isIosBrowser({ userAgent, maxTouchPoints })).toBe(expected)
  })
})
