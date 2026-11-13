import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { INTRO_SHOTS } from './intro-shots'
import { canStep, DRAG_TO_CLOSE, lightboxReducer, pulledDown } from './lightbox-state'

const reduce = lightboxReducer(INTRO_SHOTS.length)

describe('the screenshot lightbox', () => {
  it('opens on the screenshot that was pressed', () => {
    expect(reduce(null, { type: 'open', index: 3 })).toEqual({ index: 3 })
    expect(reduce(null, { type: 'open', index: 7 })).toBeNull()
  })

  it('steps left and right and stops at both ends', () => {
    let state = reduce(null, { type: 'open', index: 0 })
    expect(canStep(state, -1, 7)).toBe(false)
    expect(reduce(state, { type: 'step', by: -1 })).toEqual({ index: 0 })
    state = reduce(state, { type: 'step', by: 1 })
    expect(state).toEqual({ index: 1 })
    state = reduce({ index: 6 }, { type: 'step', by: 1 })
    expect(state).toEqual({ index: 6 })
    expect(canStep(state, 1, 7)).toBe(false)
    expect(canStep(state, -1, 7)).toBe(true)
  })

  it('closes from any screenshot, and a closed lightbox does not step', () => {
    expect(reduce({ index: 4 }, { type: 'close' })).toBeNull()
    expect(reduce(null, { type: 'step', by: 1 })).toBeNull()
  })

  it('counts only a mostly downward drag as pulling the sheet', () => {
    expect(pulledDown(4, 120)).toBe(120)
    expect(pulledDown(100, 120)).toBe(0)
    expect(pulledDown(0, -50)).toBe(0)
    expect(pulledDown(0, 10)).toBe(0)
    expect(DRAG_TO_CLOSE).toBeGreaterThan(12)
  })

  it('keeps seven screenshots, each with a thumbnail and a large file', () => {
    expect(INTRO_SHOTS.map(shot => shot.key)).toEqual(['roadmap', 'script', 'xhsPost', 'storyboard', 'storeVisit', 'shotvivaImage', 'tools'])
    for (const shot of INTRO_SHOTS) {
      expect(shot.thumb.src).toMatch(/-thumb\.webp$/)
      expect(Math.max(shot.large.width, shot.large.height)).toBe(1200)
    }
  })
})

// The real files in public/: thumbnails ≤ 40 KB, large ≤ 150 KB, and the pixel sizes the boxes
// are reserved with. Lossy WebP ('VP8 ') stores width and height in its frame header.
function webpSize(path: string): { bytes: number; width: number; height: number } {
  const file = readFileSync(new URL(`../../../../../public${path}`, import.meta.url))
  expect(file.toString('ascii', 12, 16)).toBe('VP8 ')
  return { bytes: file.length, width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff }
}

describe('the screenshot files', () => {
  it('match the sizes the dialog reserves and stay within budget', () => {
    for (const shot of INTRO_SHOTS) {
      const thumb = webpSize(shot.thumb.src)
      expect([thumb.width, thumb.height]).toEqual([shot.thumb.width, shot.thumb.height])
      expect(thumb.bytes).toBeLessThanOrEqual(40 * 1024)
      const large = webpSize(shot.large.src)
      expect([large.width, large.height]).toEqual([shot.large.width, shot.large.height])
      expect(large.bytes).toBeLessThanOrEqual(150 * 1024)
    }
  })
})
