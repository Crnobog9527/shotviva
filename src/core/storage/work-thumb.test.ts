import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { png, text } from '../../../tests/fakes/images'
import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { WORK_THUMB_PX, writeWorkThumb } from './work-thumb'

const owner = { userId: 'u1', jobId: '9e8d7c6b-5a49-4382-a716-152433445566' }
const KEY = `outputs/u1/${owner.jobId}-thumb.webp`
const FREE_KEY = `outputs/u1/${owner.jobId}-thumb-p1.webp`

// ARCHITECTURE §8.3「作品小图」: written next to the result, and never in the way of settling it.
describe('writeWorkThumb', () => {
  it('writes a small WebP next to the result', async () => {
    const r2 = createMemoryStore()
    expect(await writeWorkThumb(r2.store, { ...owner, bytes: await png(1024, 1280), pool: 'paid' })).toBe(true)
    const stored = r2.objects.get(KEY)
    expect(stored?.contentType).toBe('image/webp')
    expect(await sharp(stored?.body).metadata()).toMatchObject({ format: 'webp', width: WORK_THUMB_PX, height: 600 })
  })

  it('writes a free work its protected copy, under its own key', async () => {
    const [free, paid] = [createMemoryStore(), createMemoryStore()]
    const bytes = await png(1024, 1024)
    await writeWorkThumb(free.store, { ...owner, bytes, pool: 'free' })
    await writeWorkThumb(paid.store, { ...owner, bytes, pool: 'paid' })
    expect(free.objects.has(KEY)).toBe(false)
    expect(Buffer.from(free.objects.get(FREE_KEY)!.body).equals(Buffer.from(paid.objects.get(KEY)!.body))).toBe(false)
  })

  it('answers false, never throws, when the bytes are no image or R2 is down', async () => {
    const r2 = createMemoryStore()
    expect(await writeWorkThumb(r2.store, { ...owner, bytes: text('not an image'), pool: 'paid' })).toBe(false)
    r2.failPut.next = true
    expect(await writeWorkThumb(r2.store, { ...owner, bytes: await png(600, 600), pool: 'paid' })).toBe(false)
    expect(r2.objects.has(KEY)).toBe(false)
  })
})
