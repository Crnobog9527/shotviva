import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png, text } from '../../../tests/fakes/images'
import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { WORK_THUMB_PX, writeWorkThumb } from './work-thumb'

const owner = { userId: 'u1', jobId: 'j1' }
const KEY = 'outputs/u1/j1-thumb.webp'

// ARCHITECTURE §8.3「作品小图」: written next to the result, and never in the way of settling it.
describe('writeWorkThumb', () => {
  it('writes a small WebP next to the result', async () => {
    const r2 = createMemoryStore()
    expect(await writeWorkThumb(r2.store, { ...owner, bytes: await png(1024, 1280), watermark: false })).toBe(true)
    const stored = r2.objects.get(KEY)
    expect(stored?.contentType).toBe('image/webp')
    expect(await sharp(stored?.body).metadata()).toMatchObject({ format: 'webp', width: WORK_THUMB_PX, height: 600 })
  })

  it('marks the copy of a free work', async () => {
    const [free, paid] = [createMemoryStore(), createMemoryStore()]
    const bytes = await png(1024, 1024)
    await writeWorkThumb(free.store, { ...owner, bytes, watermark: true })
    await writeWorkThumb(paid.store, { ...owner, bytes, watermark: false })
    expect(Buffer.from(free.objects.get(KEY)!.body).equals(Buffer.from(paid.objects.get(KEY)!.body))).toBe(false)
  })

  it('answers false, never throws, when the bytes are no image or R2 is down', async () => {
    const r2 = createMemoryStore()
    expect(await writeWorkThumb(r2.store, { ...owner, bytes: text('not an image'), watermark: false })).toBe(false)
    r2.failPut.next = true
    expect(await writeWorkThumb(r2.store, { ...owner, bytes: await png(600, 600), watermark: false })).toBe(false)
    expect(r2.objects.has(KEY)).toBe(false)
  })
})
