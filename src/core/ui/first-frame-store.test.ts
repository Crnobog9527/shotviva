import { afterEach, describe, expect, it } from 'vitest'

import { firstFrameOf, registerFirstFrame } from './first-frame-store'

afterEach(() => {
  delete (globalThis as { __svFirstFrames?: unknown }).__svFirstFrames
})

describe('first-frame store (server side)', () => {
  it('gives back the frame registered for a picture, and nothing for an unknown one', () => {
    expect(registerFirstFrame('/home/a.webp', 'data:image/avif;base64,AAAA')).toBe(true)
    expect(firstFrameOf('/home/a.webp')).toBe('data:image/avif;base64,AAAA')
    expect(firstFrameOf('/home/b.webp')).toBeUndefined()
  })

  it('ignores a picture without a frame', () => {
    expect(registerFirstFrame('/home/a.webp', null)).toBe(false)
    expect(registerFirstFrame('/home/a.webp', undefined)).toBe(false)
    expect(firstFrameOf('/home/a.webp')).toBeUndefined()
  })

  it('keeps a bounded number of frames, dropping the one registered longest ago', () => {
    for (let index = 0; index < 201; index += 1) registerFirstFrame(`/cover-${index}`, `data:${index}`)
    expect(firstFrameOf('/cover-0')).toBeUndefined()
    expect(firstFrameOf('/cover-1')).toBe('data:1')
    expect(firstFrameOf('/cover-200')).toBe('data:200')
  })
})
