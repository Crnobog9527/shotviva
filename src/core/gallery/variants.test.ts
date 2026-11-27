import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { galleryImage } from '../storage'
import { deleteGalleryVariants, galleryVariantKey, galleryVariantKeys, galleryVariantKeysFor, galleryVariantVersion, storeGalleryVariants, writeGalleryVariants } from './variants'

const OUTPUT = 'outputs/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png'
const JOB = '22222222-2222-4222-8222-222222222222'
const work = (creditPool: 'free' | 'paid' = 'free') => ({ id: JOB, outputKey: OUTPUT, creditPool })
const keyOf = (width: 480 | 960, pool: 'free' | 'paid' = 'free') => galleryVariantKey(OUTPUT, width, galleryVariantVersion(pool))

describe('gallery variants', () => {
  it('sit next to the output under the owner prefix, one per gallery size', () => {
    expect(keyOf(480, 'paid')).toBe(OUTPUT.replace('.png', '-gallery-v1-480.webp'))
    expect(galleryVariantKey('outputs/u.v/job', 960, 'v1')).toBe('outputs/u.v/job-gallery-v1-960.webp')
    // Free works are served from their protected copies (2026-11-22), under keys of their own, so
    // a copy with only the old corner mark is never served again.
    expect(galleryVariantKeysFor(work('free'))).toEqual([OUTPUT.replace('.png', '-gallery-p1-480.webp'), OUTPUT.replace('.png', '-gallery-p1-960.webp')])
    expect(galleryVariantKeysFor(work('paid'))).toEqual([OUTPUT.replace('.png', '-gallery-v1-480.webp'), OUTPUT.replace('.png', '-gallery-v1-960.webp')])
    // Deleting a work removes every version, the retired ones included.
    expect(galleryVariantKeys(OUTPUT)).toEqual([...galleryVariantKeysFor(work('paid')), ...galleryVariantKeysFor(work('free'))])
    for (const key of galleryVariantKeys(OUTPUT)) expect(key.startsWith('outputs/11111111-1111-4111-8111-111111111111/')).toBe(true)
  })

  it('are the same bytes the route rendered before: marked only for free works', async () => {
    const original = await png(1536, 1152)
    for (const pool of ['free', 'paid'] as const) {
      const r2 = createMemoryStore()
      expect(await storeGalleryVariants(r2.store, work(pool), original)).toBe(true)
      for (const width of [480, 960] as const) {
        const stored = r2.objects.get(keyOf(width, pool))!
        expect(stored.contentType).toBe('image/webp')
        expect(stored.body).toEqual(await galleryImage(original, width, pool === 'free' ? { jobId: JOB } : null))
      }
    }
  })

  it('reuse a size already rendered, and never throw', async () => {
    const r2 = createMemoryStore()
    const ready = new Uint8Array([9])
    await storeGalleryVariants(r2.store, work(), await png(400, 400), { 480: ready })
    expect(r2.objects.get(keyOf(480))?.body).toEqual(ready)
    expect((await sharp(r2.objects.get(keyOf(960))!.body).metadata()).width).toBe(400)
    r2.failPut.next = true
    expect(await storeGalleryVariants(r2.store, work(), await png(400, 400))).toBe(false)
  })

  it('are written at approval from the original, skipped when already there, and never throw', async () => {
    const r2 = createMemoryStore()
    expect(await writeGalleryVariants(r2.store, work())).toBe(false)
    r2.upload(OUTPUT, await png(1200, 900), 'image/png')
    expect(await writeGalleryVariants(r2.store, work())).toBe(true)
    expect(galleryVariantKeysFor(work()).every((key) => r2.objects.has(key))).toBe(true)
    const get = vi.spyOn(r2.store, 'get')
    expect(await writeGalleryVariants(r2.store, work())).toBe(true)
    expect(get).not.toHaveBeenCalled()
  })

  it('are deleted best effort, counting what would not go', async () => {
    const r2 = createMemoryStore()
    await storeGalleryVariants(r2.store, work(), await png(300, 300))
    expect(await deleteGalleryVariants(r2.store, work())).toBe(0)
    expect(galleryVariantKeys(OUTPUT).some((key) => r2.objects.has(key))).toBe(false)
    const failing = { delete: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined) }
    expect(await deleteGalleryVariants(failing, work())).toBe(1)
    expect(failing.delete).toHaveBeenCalledTimes(4)
  })
})
