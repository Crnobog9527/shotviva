import { describe, expect, it } from 'vitest'

import { canSubmit, nextSlotId, settleSlots, tilesLeft, uploadedKeys, type Slot } from './post-form-state'

const done = (id: number): Slot => ({ id, key: `inputs/u/${id}.jpg`, picked: true })
const uploading = (id: number): Slot => ({ id, key: null, picked: true })
const open = (id: number): Slot => ({ id, key: null, picked: false })
const TEXT = 'A dark brunch poster'

describe('post form state', () => {
  it('needs 1–3 uploaded photos, nothing still uploading, and a description', () => {
    expect(canSubmit([done(0), open(1)], TEXT)).toBe(true)
    expect(canSubmit([done(0), done(1), done(2)], TEXT)).toBe(true)
    expect(canSubmit([done(0), uploading(1), open(2)], TEXT)).toBe(false)
    expect(canSubmit([open(0)], TEXT)).toBe(false)
    expect(canSubmit([done(0), open(1)], '   ')).toBe(false)
  })

  it('caps the description at 300 characters after trimming', () => {
    expect(canSubmit([done(0)], ` ${'x'.repeat(300)} `)).toBe(true)
    expect(canSubmit([done(0)], 'x'.repeat(301))).toBe(false)
  })

  it('collects only picked, uploaded keys in tile order and numbers new tiles uniquely', () => {
    expect(uploadedKeys([done(2), uploading(0), done(1), open(3)])).toEqual(['inputs/u/2.jpg', 'inputs/u/1.jpg'])
    expect(nextSlotId([done(0), done(4)])).toBe(5)
    expect(nextSlotId([])).toBe(0)
  })

  it('keeps one open tile after the picked ones until three are picked', () => {
    expect(settleSlots([])).toEqual([open(0)])
    expect(settleSlots([uploading(0)])).toEqual([uploading(0), open(1)])
    expect(settleSlots([done(0), open(1)])).toEqual([done(0), open(1)])
    expect(settleSlots([done(0), done(1), uploading(2)])).toEqual([done(0), done(1), uploading(2)])
    // removing the middle photo of three opens a tile again, at the end
    expect(settleSlots([done(0), done(2)])).toEqual([done(0), done(2), open(3)])
  })

  it('counts the tiles left for the open tile line', () => {
    expect(tilesLeft([open(0)])).toBe(3)
    expect(tilesLeft([done(0), uploading(1), open(2)])).toBe(1)
  })
})
