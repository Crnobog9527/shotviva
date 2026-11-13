import { describe, expect, it } from 'vitest'

import { defaultResolution } from './use-poster-studio'

describe('defaultResolution', () => {
  it('starts on 2K whenever the template sells it, 1K included or not', () => {
    expect(defaultResolution(['1k', '2k', '3k'])).toBe('2k')
    expect(defaultResolution(['2k', '3k'])).toBe('2k')
  })

  it('falls back to the first tier the template sells', () => {
    expect(defaultResolution(['1k'])).toBe('1k')
    expect(defaultResolution(['3k'])).toBe('3k')
    expect(defaultResolution([])).toBe('2k')
  })
})
