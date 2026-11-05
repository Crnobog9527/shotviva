import { describe, expect, it } from 'vitest'

import { canSubmit, nextSlotId, uploadedKeys } from './post-form-state'

const done = (id: number) => ({ id, key: `inputs/u/${id}.jpg` })
const pending = (id: number) => ({ id, key: null })

describe('post form state', () => {
  it('needs every photo uploaded and a description', () => {
    expect(canSubmit([done(0)], 'A dark brunch poster')).toBe(true)
    expect(canSubmit([done(0), pending(1)], 'A dark brunch poster')).toBe(false)
    expect(canSubmit([pending(0)], 'A dark brunch poster')).toBe(false)
    expect(canSubmit([done(0)], '   ')).toBe(false)
  })

  it('caps the description at 300 characters after trimming', () => {
    expect(canSubmit([done(0)], ` ${'x'.repeat(300)} `)).toBe(true)
    expect(canSubmit([done(0)], 'x'.repeat(301))).toBe(false)
  })

  it('collects keys in field order and numbers new fields uniquely', () => {
    expect(uploadedKeys([done(2), pending(0), done(1)])).toEqual(['inputs/u/2.jpg', 'inputs/u/1.jpg'])
    expect(nextSlotId([done(0), done(4)])).toBe(5)
    expect(nextSlotId([])).toBe(0)
  })
})
