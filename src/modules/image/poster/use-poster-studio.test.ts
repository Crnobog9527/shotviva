import { describe, expect, it } from 'vitest'

import { RESOLUTIONS } from '@/core/templates/output-options'

import { defaultResolution } from './use-poster-studio'

// Tiers by position (Standard, HD, Max), so the test holds whatever the Max id is called.
const [standard, hd, max] = RESOLUTIONS

describe('defaultResolution', () => {
  it('starts on 2K whenever the template sells it, 1K included or not', () => {
    expect(defaultResolution([standard, hd, max])).toBe('2k')
    expect(defaultResolution([hd, max])).toBe('2k')
  })

  it('falls back to the first tier the template sells', () => {
    expect(defaultResolution([standard])).toBe(standard)
    expect(defaultResolution([max])).toBe(max)
    expect(defaultResolution([])).toBe('2k')
  })
})
