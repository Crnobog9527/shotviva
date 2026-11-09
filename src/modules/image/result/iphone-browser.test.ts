import { describe, expect, it } from 'vitest'

import { isIphoneBrowser } from './iphone-browser'

describe('iPhone photo actions', () => {
  it.each([
    ['iPhone; Safari', 5, 390, 844, true],
    ['iPhone; CriOS', 5, 430, 932, true],
    ['Macintosh; Safari', 5, 844, 390, true],
    ['Macintosh; Safari', 5, 744, 1133, false],
    ['Macintosh; Chrome', 0, 390, 844, false],
    ['Android; Chrome Mobile', 5, 390, 844, false],
  ] as const)('detects %s with %i touch points at %i × %i', (userAgent, maxTouchPoints, width, height, expected) => {
    expect(isIphoneBrowser({ userAgent, maxTouchPoints }, { width, height })).toBe(expected)
  })
})
