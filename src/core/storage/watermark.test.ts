import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { applyWatermark, galleryImage, shouldWatermark, workThumbImage } from './watermark'

const MARK = { jobId: '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d' }

async function region(image: Uint8Array, left: number, top: number, size = 24) {
  return sharp(image).extract({ left, top, width: size, height: size }).raw().toBuffer()
}

// Owner 2026-11-22: free-pool works (personal and channel-partner promo credits) are protected
// wherever they are served; paid works stay exactly as they were.
describe('free and paid copies', () => {
  it('protects free works and never paid ones', () => {
    expect(shouldWatermark('free')).toBe(true)
    expect(shouldWatermark('paid')).toBe(false)
  })

  it('caps a free download at 1080 px on the long edge, as a small JPEG', async () => {
    const marked = await applyWatermark(await png(2048, 2560), MARK)
    expect(await sharp(marked).metadata()).toMatchObject({ format: 'jpeg', width: 864, height: 1080 })
    expect(marked.length).toBeLessThan(1024 * 1024)
    // Never enlarged.
    expect(await sharp(await applyWatermark(await png(600, 400), MARK)).metadata()).toMatchObject({ width: 600, height: 400 })
  })

  it('marks the whole picture, not just a corner', async () => {
    const original = await png(1080, 1080)
    const marked = await applyWatermark(original, MARK)
    const plain = new Uint8Array(await sharp(original).jpeg({ quality: 86, mozjpeg: true }).toBuffer())
    // Every quarter of the picture differs from the unmarked copy.
    for (const [left, top] of [[0, 0], [540, 0], [0, 540], [540, 540]] as const) {
      expect((await region(marked, left, top, 540)).equals(await region(plain, left, top, 540))).toBe(false)
    }
  })

  it('puts a transparent PNG on white, not black', async () => {
    const cutOut = await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const marked = await applyWatermark(new Uint8Array(cutOut), MARK)
    const [r, g, b] = await region(marked, 0, 0)
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(240)
  })

  it('keeps a cut-out’s alpha for its 透明底 file, mark included, as a PNG', async () => {
    const cutOut = await sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const marked = await applyWatermark(new Uint8Array(cutOut), MARK, 'transparent')
    expect(await sharp(marked).metadata()).toMatchObject({ format: 'png', width: 900, height: 600, hasAlpha: true })
    const alpha = await sharp(marked).extractChannel('alpha').raw().toBuffer()
    // Mostly still see-through; the mark itself is not.
    const opaque = alpha.filter((a) => a > 0).length
    expect(opaque).toBeGreaterThan(0)
    expect(opaque / alpha.length).toBeLessThan(0.35)
  })

  it('makes the gallery copy: scaled WebP; a free one protected and capped, a paid one a clean resize', async () => {
    const original = await png(1536, 1920)
    const free = await galleryImage(original, 960, MARK)
    const paid = await galleryImage(original, 960, null)
    expect(await sharp(free).metadata()).toMatchObject({ format: 'webp', width: 864, height: 1080 })
    expect(await sharp(paid).metadata()).toMatchObject({ format: 'webp', width: 960, height: 1200 })
    const cleanResize = new Uint8Array(await sharp(original).resize({ width: 960 }).webp({ quality: 80 }).toBuffer())
    expect(Buffer.from(paid).equals(Buffer.from(cleanResize))).toBe(true)
    expect(await sharp(await galleryImage(await png(300, 200), 960, null)).metadata()).toMatchObject({ width: 300, height: 200 })
  })
})

// ARCHITECTURE §8.3「作品小图」: the short edge is scaled, whatever the shape, and never up.
describe('work thumbnail image', () => {
  it('makes the list copy: short edge scaled, WebP, far smaller than the original', async () => {
    const tall = await png(912, 1136)
    const thumb = await workThumbImage(tall, 480, null)
    expect(await sharp(thumb).metadata()).toMatchObject({ format: 'webp', width: 480, height: 598, hasAlpha: false })
    expect(thumb.length).toBeLessThan(tall.length)
    expect(await sharp(await workThumbImage(await png(1536, 864), 480, null)).metadata()).toMatchObject({ width: 853, height: 480 })
    expect(await sharp(await workThumbImage(await png(300, 200), 480, null)).metadata()).toMatchObject({ width: 300, height: 200 })
  })

  it('protects the list copy of a free work, same size, and only that one', async () => {
    const original = await png(1024, 1024)
    const marked = await workThumbImage(original, 480, MARK)
    const clean = await workThumbImage(original, 480, null)
    expect(await sharp(marked).metadata()).toMatchObject({ format: 'webp', width: 480, height: 480 })
    expect((await region(marked, 0, 0, 240)).equals(await region(clean, 0, 0, 240))).toBe(false)
    expect((await region(marked, 240, 240, 240)).equals(await region(clean, 240, 240, 240))).toBe(false)
  })

  it('puts a cut-out list copy on white', async () => {
    const cutOut = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const thumb = await workThumbImage(new Uint8Array(cutOut), 480, null)
    const [r, g, b] = await sharp(thumb).extract({ left: 0, top: 0, width: 8, height: 8 }).raw().toBuffer()
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(245)
  })
})
