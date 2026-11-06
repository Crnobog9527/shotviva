import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { hasTransparentPixel, isJpeg, isPng, pngMayHaveAlpha } from './transparency'

const encode = async (channels: 3 | 4, alpha = 1) =>
  new Uint8Array(await sharp({ create: { width: 8, height: 8, channels, background: { r: 10, g: 20, b: 30, alpha } } }).png().toBuffer())

describe('transparency checks', () => {
  it('tells PNG and JPEG apart from their first bytes', async () => {
    const png = await encode(3)
    const jpeg = new Uint8Array(await sharp(png).jpeg().toBuffer())
    expect([isPng(png), isJpeg(png)]).toEqual([true, false])
    expect([isPng(jpeg), isJpeg(jpeg)]).toEqual([false, true])
  })

  it('skips the decode for an opaque RGB PNG and flags one with an alpha channel', async () => {
    expect(pngMayHaveAlpha(await encode(3))).toBe(false)
    expect(pngMayHaveAlpha(await encode(4, 0))).toBe(true)
  })

  it('flags a palette PNG that carries a tRNS chunk', async () => {
    const rgba = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png({ palette: true })
      .toBuffer()
    expect(pngMayHaveAlpha(new Uint8Array(rgba))).toBe(true)
  })

  it('answers maybe when the head ends before IDAT, and no for non-PNG bytes', async () => {
    const png = await encode(3)
    // Signature + IHDR only: colour type 2 but the chunks after it are cut off.
    expect(pngMayHaveAlpha(png.subarray(0, 33))).toBe(true)
    expect(pngMayHaveAlpha(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false)
  })

  it('counts a pixel as see-through below alpha 250, ignoring encoder noise', () => {
    expect(hasTransparentPixel([1, 2, 3, 255, 1, 2, 3, 251])).toBe(false)
    expect(hasTransparentPixel([1, 2, 3, 255, 1, 2, 3, 0])).toBe(true)
    expect(hasTransparentPixel([1, 2, 3, 120])).toBe(true)
    expect(hasTransparentPixel([])).toBe(false)
  })
})
