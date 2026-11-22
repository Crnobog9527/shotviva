import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { jpeg, png } from '../../../tests/fakes/images'
import { PRESIZED_WIDTHS, presizedPath, presizedPaths } from '../presized'
import { hasPresizedCopies, presizedCopies, withPresizedCopies } from './presized-copies'

const KEY = 'covers/korean-manhwa/after-8c988390aa621eda.webp'

async function webp(width: number, height: number) {
  return new Uint8Array(await sharp(await jpeg(width, height)).webp().toBuffer())
}

describe('presizedCopies', () => {
  it('makes one WebP per stored width, never wider than the picture', async () => {
    const copies = await presizedCopies(await webp(900, 1125))
    expect(copies.map((copy) => copy.width)).toEqual([...PRESIZED_WIDTHS])
    for (const copy of copies) {
      const meta = await sharp(copy.bytes).metadata()
      expect(meta.format).toBe('webp')
      expect(meta.width).toBe(Math.min(copy.width, 900))
    }
    // Widths past the picture's own share one encoding.
    const capped = copies.filter((copy) => copy.width >= 900)
    expect(new Set(capped.map((copy) => copy.bytes)).size).toBe(1)
  })

  it('turns a PNG or JPEG source into WebP too', async () => {
    const [first] = await presizedCopies(await png(300, 200))
    expect((await sharp(first?.bytes).metadata()).format).toBe('webp')
  })
})

describe('withPresizedCopies (the public bucket’s store)', () => {
  it('writes every copy with a cover, cached for a year', async () => {
    const { store, objects } = createMemoryStore()
    await withPresizedCopies(store).put(KEY, await webp(1200, 1600), 'image/webp', { cacheControl: 'public, max-age=31536000, immutable' })
    expect(objects.has(KEY)).toBe(true)
    expect(await hasPresizedCopies(store, KEY)).toBe(true)
    expect(objects.get(presizedPath(KEY, 384))?.contentType).toBe('image/webp')
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
