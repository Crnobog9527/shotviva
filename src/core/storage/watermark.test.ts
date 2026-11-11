import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { applyWatermark, galleryImage, shouldWatermark, workThumbImage } from './watermark'

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

  // T108: the gallery's copy is scaled, never enlarged, WebP, and marked only for free works.
  it('makes the gallery copy: scaled WebP, marked only when asked', async () => {
    const original = await png(1536, 1152)
    const marked = await galleryImage(original, 480, true)
    const clean = await galleryImage(original, 480, false)
    expect(await sharp(marked).metadata()).toMatchObject({ format: 'webp', width: 480, height: 360 })
    expect(Buffer.from(marked).equals(Buffer.from(clean))).toBe(false)
    expect(await sharp(await galleryImage(await png(300, 200), 960, false)).metadata()).toMatchObject({ width: 300, height: 200 })
  })
})

// ARCHITECTURE §8.3「作品小图」: the short edge is scaled, whatever the shape, and never up.
describe('work thumbnail image', () => {
  it('makes the list copy: short edge scaled, WebP, far smaller than the original', async () => {
    const tall = await png(912, 1136)
    const thumb = await workThumbImage(tall, 480, false)
    expect(await sharp(thumb).metadata()).toMatchObject({ format: 'webp', width: 480, height: 598, hasAlpha: false })
    expect(thumb.length).toBeLessThan(tall.length)
    expect(await sharp(await workThumbImage(await png(1536, 864), 480, false)).metadata()).toMatchObject({ width: 853, height: 480 })
    expect(await sharp(await workThumbImage(await png(300, 200), 480, false)).metadata()).toMatchObject({ width: 300, height: 200 })
  })

  it('marks the list copy of a free work in the bottom-right corner, and only that one', async () => {
    const original = await png(1024, 1024)
    const marked = await workThumbImage(original, 480, true)
    const clean = await workThumbImage(original, 480, false)
    expect(await sharp(marked).metadata()).toMatchObject({ width: 480, height: 480 })
    expect((await region(marked, 0, 0)).equals(await region(clean, 0, 0))).toBe(true)
    expect((await region(marked, 480 - 130, 480 - 40)).equals(await region(clean, 480 - 130, 480 - 40))).toBe(false)
  })

  it('puts a cut-out list copy on white', async () => {
    const cutOut = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const thumb = await workThumbImage(new Uint8Array(cutOut), 480, false)
    const [r, g, b] = await sharp(thumb).extract({ left: 0, top: 0, width: 8, height: 8 }).raw().toBuffer()
    expect(Math.min(r, g, b)).toBeGreaterThan(245)
  })
})
