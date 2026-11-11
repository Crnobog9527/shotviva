import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { flattenOnWhite } from './flatten'

// A product cut-out: an orange box in the middle of a fully transparent canvas, a soft edge around it.
async function cutOut(width: number, height: number): Promise<Uint8Array> {
  const product = await sharp({ create: { width: width / 2, height: height / 2, channels: 4, background: { r: 230, g: 110, b: 30, alpha: 1 } } }).png().toBuffer()
  const halo = await sharp({ create: { width: width / 2 + 8, height: height / 2 + 8, channels: 4, background: { r: 230, g: 110, b: 30, alpha: 0.5 } } }).png().toBuffer()
  const clear = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  const composed = await clear.composite([{ input: halo, left: width / 4 - 4, top: height / 4 - 4 }, { input: product, left: width / 4, top: height / 4 }]).png().toBuffer()
  return new Uint8Array(composed)
}

async function pixel(image: Uint8Array, left: number, top: number) {
  return [...(await sharp(image).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer())]
}

describe('白底 (flattenOnWhite)', () => {
  it('puts a cut-out on pure #FFFFFF at full resolution, as a JPEG', async () => {
    const flat = await flattenOnWhite(await cutOut(1024, 768))
    expect(await sharp(flat).metadata()).toMatchObject({ format: 'jpeg', width: 1024, height: 768, hasAlpha: false, channels: 3 })
    // The ground is exactly 255 (shops check it), corners and edges alike.
    for (const [left, top] of [[0, 0], [1023, 0], [0, 767], [1023, 767], [100, 384]]) {
      expect(await pixel(flat, left, top)).toEqual([255, 255, 255])
    }
    // The product keeps its colour; the half-transparent halo blends towards white, not black.
    const [r, g, b] = await pixel(flat, 512, 384)
    expect(Math.abs(r - 230) + Math.abs(g - 110) + Math.abs(b - 30)).toBeLessThan(12)
    const halo = await pixel(flat, 256 - 2, 384)
    expect(Math.min(...halo)).toBeGreaterThan(100)
  })

  it('leaves an opaque image as it was, apart from the format', async () => {
    const flat = await flattenOnWhite(await png(640, 480))
    expect(await sharp(flat).metadata()).toMatchObject({ format: 'jpeg', width: 640, height: 480 })
    const [r, g, b] = await pixel(flat, 320, 240)
    expect(Math.abs(r - 30) + Math.abs(g - 90) + Math.abs(b - 160)).toBeLessThan(8)
  })
})

