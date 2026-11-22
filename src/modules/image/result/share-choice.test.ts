import { describe, expect, it } from 'vitest'

import { shareChoice } from './share-choice'

describe('shareChoice', () => {
  it('hands the photo itself to a phone that can share the file', () => {
    expect(shareChoice({ fileReady: true, touch: true, link: true })).toBe('file')
    expect(shareChoice({ fileReady: true, touch: true, link: false })).toBe('file')
  })

  it('falls back to the share link where the file cannot be shared (in-app and older browsers)', () => {
    expect(shareChoice({ fileReady: false, touch: true, link: true })).toBe('link')
  })

  it('gives a desktop pointer the link when there is one', () => {
    expect(shareChoice({ fileReady: true, touch: false, link: true })).toBe('link')
    expect(shareChoice({ fileReady: false, touch: false, link: true })).toBe('link')
  })

  it('keeps the old file-only behaviour where no link can be made, and nothing when neither works', () => {
    expect(shareChoice({ fileReady: true, touch: false, link: false })).toBe('file')
    expect(shareChoice({ fileReady: false, touch: true, link: false })).toBeNull()
  })
})
