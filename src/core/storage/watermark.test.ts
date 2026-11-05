import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { applyWatermark, shouldWatermark } from './watermark'

async function region(image: Uint8Array, left: number, top: number) {
  return sharp(image).extract({ left, top, width: 64, height: 24 }).raw().toBuffer()
}

describe('watermark', () => {
  it('applies only to public works of unpaid owners', () => {
    expect(shouldWatermark('public', false)).toBe(true)
    expect(shouldWatermark('public', true)).toBe(false)
    expect(shouldWatermark('private', false)).toBe(false)
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
})
