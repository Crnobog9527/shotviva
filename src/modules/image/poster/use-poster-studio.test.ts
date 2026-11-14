import { describe, expect, it } from 'vitest'

import { RESOLUTIONS } from '@/core/templates/output-options'

import { defaultResolution, sortFailure } from './use-poster-studio'

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

// A 429 from 整理内容 keeps the pasted text on the paste step with 「太频繁」, never an empty editor.
describe('sortFailure', () => {
  it('keeps the paste step when the hour is used up, opens the blocks otherwise', () => {
    expect(sortFailure({ status: 'error', code: 'RATE_LIMITED' })).toBe('rateLimited')
    expect(sortFailure({ status: 'failed' })).toBe('sortFailed')
    expect(sortFailure({ status: 'error', code: 'INTERNAL' })).toBe('sortFailed')
  })
})
