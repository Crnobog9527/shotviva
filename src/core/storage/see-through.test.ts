import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { loadInputImage, normalizeInputImage } from './input-image'
import { MATTE_DARK, MATTE_WHITE, matteFor } from './rules'
import { opaqueWebp } from './see-through'

// A 64² transparent canvas with a 32² opaque square in the middle: a logo exported with alpha.
async function logo(color: { r: number; g: number; b: number }, format: 'png' | 'webp' = 'png'): Promise<Uint8Array> {
  const square = await sharp({ create: { width: 32, height: 32, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer()
  const image = sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: square, left: 16, top: 16 }])
  return new Uint8Array(await (format === 'png' ? image.png() : image.webp({ lossless: true })).toBuffer())
}

async function pixel(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (y * info.width + x) * info.channels
  return { r: data[at]!, g: data[at + 1]!, b: data[at + 2]! }
}

const NAVY = { r: 20, g: 30, b: 120 }

describe('matteFor (shared with the browser)', () => {
  it('leaves an opaque image alone', () => expect(matteFor([10, 20, 30, 255, 200, 200, 200, 255])).toBeNull())
  it('puts dark content on white', () => expect(matteFor([0, 0, 0, 0, 20, 30, 120, 255])).toEqual(MATTE_WHITE))
  it('puts light content on a dark ground so it stays visible', () => expect(matteFor([0, 0, 0, 0, 250, 250, 250, 255])).toEqual(MATTE_DARK))
  it('uses white for a fully transparent image', () => expect(matteFor([9, 9, 9, 0])).toEqual(MATTE_WHITE))
})

describe('transparent uploads sent to the model (2026-11-14 black-logo bug)', () => {
  it('flattens a transparent PNG upload onto white instead of black', async () => {
    const { store, upload } = createMemoryStore()
    upload('inputs/u/logo.png', await logo(NAVY), 'image/png')
    const image = await loadInputImage(store, 'inputs/u/logo.png')
    expect(image).toMatchObject({ contentType: 'image/jpeg', width: 64, height: 64 })
    const corner = await pixel(image.bytes, 2, 2)
    expect(Math.min(corner.r, corner.g, corner.b)).toBeGreaterThan(245)
    const middle = await pixel(image.bytes, 32, 32)
    expect(middle.b).toBeGreaterThan(100)
    expect(middle.r).toBeLessThan(50)
  })

  it('puts a white logo on a dark ground', async () => {
    const corner = await pixel(await normalizeInputImage(await logo({ r: 255, g: 255, b: 255 })), 2, 2)
    expect(Math.max(corner.r, corner.g, corner.b)).toBeLessThan(50)
    const middle = await pixel(await normalizeInputImage(await logo({ r: 255, g: 255, b: 255 })), 32, 32)
    expect(Math.min(middle.r, middle.g, middle.b)).toBeGreaterThan(240)
  })

  it('leaves the stored upload untouched', async () => {
    const { store, upload, objects } = createMemoryStore()
    const original = await logo(NAVY)
    upload('inputs/u/logo.png', original, 'image/png')
    await loadInputImage(store, 'inputs/u/logo.png')
    expect((await sharp(await store.get('inputs/u/logo.png')).metadata()).hasAlpha).toBe(true)
    expect(objects.has('inputs/u/logo.png')).toBe(true)
  })

  it('flattens a see-through WebP style reference and keeps an opaque one byte for byte', async () => {
    const flattened = await opaqueWebp(await logo(NAVY, 'webp'))
    expect((await sharp(flattened).metadata()).format).toBe('webp')
    const corner = await pixel(flattened, 2, 2)
    expect(Math.min(corner.r, corner.g, corner.b)).toBeGreaterThan(245)
    const opaque = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: NAVY } }).webp().toBuffer())
    expect(await opaqueWebp(opaque)).toBe(opaque)
    const junk = Uint8Array.of(1, 2, 3)
    expect(await opaqueWebp(junk)).toBe(junk)
  })
})
