import { describe, expect, it } from 'vitest'

import { mp4Header } from '../../../../tests/fakes/images'

import { coverFileProblem } from './cover-rules'
import { mp4DurationSeconds } from './mp4-duration'

const MB = 1024 * 1024

describe('cover file rules', () => {
  it('takes stills for before / after / poster and GIF, WebP or MP4 for motion', () => {
    expect(coverFileProblem('after', { type: 'image/webp', size: MB })).toBeNull()
    expect(coverFileProblem('after', { type: 'image/gif', size: MB })).not.toBeNull()
    expect(coverFileProblem('motion', { type: 'image/gif', size: MB })).toBeNull()
    expect(coverFileProblem('motion', { type: 'video/mp4', size: MB })).toBeNull()
    expect(coverFileProblem('motion', { type: 'video/quicktime', size: MB })).not.toBeNull()
  })

  it('caps images at 20MB and videos at 15MB', () => {
    expect(coverFileProblem('before', { type: 'image/jpeg', size: 20 * MB + 1 })).toMatch(/20MB/)
    expect(coverFileProblem('motion', { type: 'video/mp4', size: 15 * MB + 1 })).toMatch(/15MB/)
    expect(coverFileProblem('motion', { type: 'image/gif', size: 16 * MB })).toBeNull()
  })
})

describe('mp4DurationSeconds', () => {
  it('reads the movie header, version 0 and 1', () => {
    expect(mp4DurationSeconds(mp4Header(12.5))).toBe(12.5)
    expect(mp4DurationSeconds(mp4Header(16, 1))).toBe(16)
  })

  it('answers null for a file without a movie header', () => {
    expect(mp4DurationSeconds(new TextEncoder().encode('not a video at all'))).toBeNull()
    expect(mp4DurationSeconds(mp4Header(3).slice(0, 30))).toBeNull()
  })
})
