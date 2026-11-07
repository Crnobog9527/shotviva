import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { jpeg } from '../../../../tests/fakes/images'

import { stillCover } from './cover-media'

// A cut-out: an opaque product on the left half, clear on the right.
async function cutOutPng(width: number, height: number): Promise<Uint8Array> {
  const product = await sharp({ create: { width: width / 2, height, channels: 4, background: { r: 200, g: 120, b: 60, alpha: 1 } } }).png().toBuffer()
  const clear = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  return new Uint8Array(await clear.composite([{ input: product, left: 0, top: 0 }]).png().toBuffer())
}

// ARCHITECTURE §8.3: every still cover leaves the upload as WebP, long edge ≤ 1600, quality 82.
describe('stillCover (compressed at upload)', () => {
  it('re-encodes to WebP with the long edge at 1600, keeping a cut-out transparent', async () => {
    const out = await stillCover(await cutOutPng(2400, 3200))
    const meta = await sharp(out.bytes).metadata()
    expect(out).toMatchObject({ contentType: 'image/webp', ext: 'webp' })
    expect(meta).toMatchObject({ format: 'webp', width: 1200, height: 1600, hasAlpha: true })
    expect(out.hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('never enlarges a small cover, and drops an opaque photo’s metadata', async () => {
    const out = await stillCover(await jpeg(880, 1184, { exif: true }))
    const meta = await sharp(out.bytes).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 880, height: 1184, hasAlpha: false })
    expect(meta.exif).toBeUndefined()
  })
})
