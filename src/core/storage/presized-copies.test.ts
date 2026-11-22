import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { jpeg, png } from '../../../tests/fakes/images'
import { PRESIZED_WIDTHS, presizedPath, presizedPaths } from '../presized'
import { encodePresized, hasPresizedCopies, presizedCopies, withPresizedCopies } from './presized-copies'

const KEY = 'covers/korean-manhwa/after-8c988390aa621eda.webp'

async function webp(width: number, height: number) {
  return new Uint8Array(await sharp(await jpeg(width, height)).webp().toBuffer())
}

// Deterministic: a linear congruential generator with a fixed seed, never Math.random or sharp's noise.
async function grainyPhoto(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3)
  let seed = 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const grain = ((seed >>> 24) - 128) * 0.25
      const i = (y * width + x) * 3
      raw[i] = Math.max(0, Math.min(255, (x * 255) / width + grain))
      raw[i + 1] = Math.max(0, Math.min(255, (y * 255) / height + grain))
      raw[i + 2] = Math.max(0, Math.min(255, 128 + 60 * Math.sin(x / 40) * Math.cos(y / 50) + grain))
    }
  }
  return new Uint8Array(await sharp(raw, { raw: { width, height, channels: 3 } }).webp().toBuffer())
}

describe('presizedCopies', () => {
  it('makes an AVIF and a WebP per stored width, never wider than the picture', async () => {
    const copies = await presizedCopies(await webp(900, 1125))
    expect(copies).toHaveLength(PRESIZED_WIDTHS.length * 2)
    for (const copy of copies) {
      const meta = await sharp(copy.bytes).metadata()
      expect(meta.format).toBe(copy.format === 'avif' ? 'heif' : 'webp')
      expect(meta.width).toBe(Math.min(copy.width, 900))
    }
    // Widths past the picture's own share one encoding per format.
    for (const format of ['avif', 'webp'] as const) {
      const capped = copies.filter((copy) => copy.format === format && copy.width >= 900)
      expect(new Set(capped.map((copy) => copy.bytes)).size).toBe(1)
    }
  })

  // A fixed photo-like picture (gradients plus seeded grain, the same bytes every run) and only
  // the one width compared: random noise through every width timed out on a busy CI runner. The
  // 5% slack keeps it independent of the libvips build; AVIF comes out at about half the WebP here.
  it('makes the AVIF no larger than the WebP at the same width, as the optimiser did', async () => {
    const source = await grainyPhoto(600, 750)
    const [avif, webpCopy] = await Promise.all([encodePresized(source, 384, 'avif'), encodePresized(source, 384, 'webp')])
    for (const [bytes, format] of [[avif, 'heif'], [webpCopy, 'webp']] as const) {
      const meta = await sharp(bytes).metadata()
      expect(meta.format).toBe(format)
      expect(meta.width).toBe(384)
    }
    expect(avif.length).toBeLessThanOrEqual(webpCopy.length * 1.05)
  }, 30_000)

  it('turns a PNG or JPEG source into both formats', async () => {
    const formats = new Set((await presizedCopies(await png(300, 200))).map((copy) => copy.format))
    expect([...formats].sort()).toEqual(['avif', 'webp'])
  })
})

describe('withPresizedCopies (the public bucket’s store)', () => {
  it('writes every copy with a cover, cached for a year', async () => {
    const { store, objects } = createMemoryStore()
    await withPresizedCopies(store).put(KEY, await webp(1200, 1600), 'image/webp', { cacheControl: 'public, max-age=31536000, immutable' })
    expect(objects.has(KEY)).toBe(true)
    expect(await hasPresizedCopies(store, KEY)).toBe(true)
    expect(objects.get(presizedPath(KEY, 384))?.contentType).toBe('image/webp')
    expect(objects.get(presizedPath(KEY, 384, 'avif'))?.contentType).toBe('image/avif')
  })

  it('writes no cover when its copies fail, so no template points at a cover without them', async () => {
    const { store, objects, failPut } = createMemoryStore()
    failPut.next = true
    await expect(withPresizedCopies(store).put(KEY, await webp(400, 500), 'image/webp')).rejects.toThrow()
    expect(objects.has(KEY)).toBe(false)
  })

  it('writes no copies for motion files, videos or anything outside covers/', async () => {
    const { store, objects } = createMemoryStore()
    const wrapped = withPresizedCopies(store)
    await wrapped.put('covers/x/motion-0123456789abcdef.webp', await webp(64, 64), 'image/webp')
    await wrapped.put('blog/cover-1.webp', await webp(64, 64), 'image/webp')
    expect([...objects.keys()].some((key) => key.startsWith('presized/'))).toBe(false)
  })

  it('copies a cover’s copies with it, or makes them when the source has none yet', async () => {
    const { store, objects, upload } = createMemoryStore()
    const wrapped = withPresizedCopies(store)
    await wrapped.put(KEY, await webp(800, 1000), 'image/webp')
    const target = 'covers/korean-manhwa-2/after-8c988390aa621eda.webp'
    await wrapped.copy(KEY, target)
    expect(await hasPresizedCopies(store, target)).toBe(true)
    expect(objects.get(presizedPath(target, 640))?.body).toBe(objects.get(presizedPath(KEY, 640))?.body)
    expect(objects.get(presizedPath(target, 640, 'avif'))?.body).toBe(objects.get(presizedPath(KEY, 640, 'avif'))?.body)

    const old = 'covers/legacy/before-0123456789abcdef.webp'
    upload(old, await webp(500, 600), 'image/webp')
    await wrapped.copy(old, 'covers/legacy-2/before-0123456789abcdef.webp')
    expect(await hasPresizedCopies(store, 'covers/legacy-2/before-0123456789abcdef.webp')).toBe(true)
  })

  it('deletes the copies after the cover', async () => {
    const { store, objects } = createMemoryStore()
    const wrapped = withPresizedCopies(store)
    await wrapped.put(KEY, await webp(300, 400), 'image/webp')
    await wrapped.delete(KEY)
    expect(objects.has(KEY)).toBe(false)
    for (const path of presizedPaths(KEY)) expect(objects.has(path)).toBe(false)
  })
})
