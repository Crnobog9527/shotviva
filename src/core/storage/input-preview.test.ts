import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { jpeg, png } from '../../../tests/fakes/images'
import { renderInputPreview, writeInputPreview } from './input-preview'

const GPS_PHOTO = async (width: number, height: number) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })
      .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '31/1 14/1 0/1' } })
      .jpeg()
      .toBuffer(),
  )

describe('renderInputPreview', () => {
  it('fits the long edge to 768 as WebP and drops EXIF and GPS', async () => {
    const meta = await sharp(await renderInputPreview(await GPS_PHOTO(1536, 2048))).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 576, height: 768 })
    expect(meta.exif).toBeUndefined()
  })

  it('never enlarges a small photo', async () => {
    const meta = await sharp(await renderInputPreview(await png(500, 300))).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 500, height: 300 })
  })
})

describe('writeInputPreview', () => {
  it('stores the preview under outputs/{user}/{job}-input.webp', async () => {
    const { store, objects } = createMemoryStore()
    expect(await writeInputPreview(store, { userId: 'u1', jobId: 'j1', bytes: await jpeg(1024, 1024) })).toBe(true)
    expect(objects.get('outputs/u1/j1-input.webp')?.contentType).toBe('image/webp')
  })

  it('only reports failure, for an R2 outage or bytes that are not an image', async () => {
    const { store, objects, failPut } = createMemoryStore()
    failPut.next = true
    expect(await writeInputPreview(store, { userId: 'u1', jobId: 'j1', bytes: await jpeg(64, 64) })).toBe(false)
    expect(await writeInputPreview(store, { userId: 'u1', jobId: 'j2', bytes: new Uint8Array([1, 2, 3]) })).toBe(false)
    expect(objects.size).toBe(0)
  })
})
