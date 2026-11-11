import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { applyWatermark, shouldWatermark } from './watermark'

async function region(image: Uint8Array, left: number, top: number) {
  return sharp(image).extract({ left, top, width: 64, height: 24 }).raw().toBuffer()
}

describe('watermark', () => {
  it('marks free works and never paid ones', () => {
    expect(shouldWatermark('free')).toBe(true)
    expect(shouldWatermark('paid')).toBe(false)
  })

  it('marks the bottom-right corner and returns a small JPEG of the same size', async () => {
    const original = await png(1536, 1152)
    const marked = await applyWatermark(original)
    const meta = await sharp(marked).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 1536, height: 1152 })
    expect(marked.length).toBeLessThan(4 * 1024 * 1024)

    const originalJpeg = new Uint8Array(await sharp(original).jpeg({ quality: 90 }).toBuffer())
    // Top-left untouched; bottom-right (where the mark sits) changed.
    expect((await region(marked, 0, 0)).equals(await region(originalJpeg, 0, 0))).toBe(true)
    expect((await region(marked, 1536 - 400, 1152 - 70)).equals(await region(originalJpeg, 1536 - 400, 1152 - 70))).toBe(false)
  })

  it('puts a transparent PNG on white, not black', async () => {
    const cutOut = await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const marked = await applyWatermark(new Uint8Array(cutOut))
    const [r, g, b] = await region(marked, 0, 0)
    expect(Math.min(r, g, b)).toBeGreaterThan(245)
  })

  it('keeps a cut-out’s alpha for its 透明底 file, mark included, as a PNG', async () => {
    const cutOut = await sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const marked = await applyWatermark(new Uint8Array(cutOut), 'transparent')
    expect(await sharp(marked).metadata()).toMatchObject({ format: 'png', width: 900, height: 600, hasAlpha: true })
    const alpha = (left: number, top: number, size: number) =>
      sharp(marked).extract({ left, top, width: size, height: size }).extractChannel('alpha').raw().toBuffer()
    // Top-left still see-through; the mark's corner is not.
    expect(Math.max(...(await alpha(0, 0, 40)))).toBe(0)
    expect(Math.max(...(await alpha(900 - 200, 600 - 50, 40)))).toBeGreaterThan(0)
  })
})
