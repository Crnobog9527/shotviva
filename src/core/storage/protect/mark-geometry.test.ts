import { describe, expect, it } from 'vitest'

import { BAND, BAND_OPACITY, freeCopySize, labelPlacement, rowOpacity, tileFontPx, TILE_OPACITY } from './mark-geometry'
import { overlayFor } from './visible-mark'

// The shapes the templates offer, plus an extreme banner: the mark must read the same on all.
const SHAPES = [
  { width: 1080, height: 1080 },
  { width: 864, height: 1080 },
  { width: 608, height: 1080 },
  { width: 1080, height: 608 },
  { width: 1080, height: 360 },
  { width: 480, height: 600 },
]

const alphaAt = (overlay: { width: number; rgba: Uint8Array }, x: number, y: number) => overlay.rgba[(y * overlay.width + x) * 4 + 3]!

describe('mark geometry (Owner 2026-11-22, sample C「中间 12%」)', () => {
  it('scales with the picture: font 4% of the width, label line 3.2%, label inside the corner', () => {
    for (const size of SHAPES) {
      expect(tileFontPx(size)).toBeCloseTo(size.width * 0.04)
      const label = labelPlacement(size, { width: 1097, height: 145, font: 64 })
      expect(label.left + label.width).toBeLessThanOrEqual(size.width)
      expect(label.top + label.height).toBeLessThanOrEqual(size.height)
      expect(label.left).toBeGreaterThan(size.width * 0.3)
      // Two lines, the first 3.2% of the width.
      expect(label.height / size.width).toBeCloseTo((145 / 64) * 0.032, 2)
    }
  })

  it('calms the middle band only: 12% from 31% to 71% of the height, 20% elsewhere', () => {
    const size = { width: 1000, height: 1000 }
    expect(rowOpacity(size, 0)).toBe(TILE_OPACITY)
    expect(rowOpacity(size, 309)).toBe(TILE_OPACITY)
    expect(rowOpacity(size, 310)).toBe(BAND_OPACITY)
    expect(rowOpacity(size, 709)).toBe(BAND_OPACITY)
    expect(rowOpacity(size, 710)).toBe(TILE_OPACITY)
  })

  it('caps every free copy at 1080 px on the long edge, never enlarging', () => {
    expect(freeCopySize({ width: 2048, height: 2560 }, { kind: 'cap' })).toEqual({ width: 864, height: 1080 })
    expect(freeCopySize({ width: 3840, height: 2160 }, { kind: 'cap' })).toEqual({ width: 1080, height: 608 })
    expect(freeCopySize({ width: 700, height: 500 }, { kind: 'cap' })).toEqual({ width: 700, height: 500 })
    expect(freeCopySize({ width: 2048, height: 2560 }, { kind: 'width', width: 960 })).toEqual({ width: 864, height: 1080 })
    expect(freeCopySize({ width: 2048, height: 2560 }, { kind: 'width', width: 480 })).toEqual({ width: 480, height: 600 })
    expect(freeCopySize({ width: 3000, height: 1000 }, { kind: 'short-edge', shortEdge: 480 })).toEqual({ width: 1080, height: 360 })
  })
})

describe('the drawn mark at several shapes', () => {
  it('covers the whole picture: every block of a 4 × 4 grid carries some of it', async () => {
    for (const size of SHAPES) {
      const overlay = await overlayFor(size)
      for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 4; bx++) {
          let hit = false
          for (let y = Math.floor((by * size.height) / 4); y < ((by + 1) * size.height) / 4 && !hit; y++) {
            for (let x = Math.floor((bx * size.width) / 4); x < ((bx + 1) * size.width) / 4 && !hit; x++) hit = alphaAt(overlay, x, y) > 0
          }
          expect(hit, `${size.width}×${size.height} block ${bx},${by}`).toBe(true)
        }
      }
    }
  })

  it('stays at 12% inside the band and 20% outside it, away from the label', async () => {
    for (const size of SHAPES) {
      const overlay = await overlayFor(size)
      const label = labelPlacement(size, { width: 1097, height: 145, font: 64 })
      let band = 0
      let outside = 0
      for (let y = 0; y < label.top; y++) {
        const inBand = y >= size.height * BAND.top && y < size.height * BAND.bottom
        for (let x = 0; x < size.width; x++) {
          const a = alphaAt(overlay, x, y)
          if (inBand) band = Math.max(band, a)
          else outside = Math.max(outside, a)
        }
      }
      expect(band, `${size.width}×${size.height} band`).toBeLessThanOrEqual(Math.ceil(BAND_OPACITY * 255) + 1)
      expect(band).toBeGreaterThan(BAND_OPACITY * 255 * 0.8)
      expect(outside, `${size.width}×${size.height} outside`).toBeLessThanOrEqual(Math.ceil(TILE_OPACITY * 255) + 1)
      expect(outside).toBeGreaterThan(BAND_OPACITY * 255 + 2)
    }
  })
})
