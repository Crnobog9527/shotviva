import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { heicHeader, jpeg, png, text } from '../../../tests/fakes/images'
import { loadInputImage } from './input-image'

const KEY = 'inputs/u/a.jpg'

describe('loadInputImage (HEAD + byte checks, AGENTS §7 item 8)', () => {
  it.each([
    ['a 25MB object', () => new Uint8Array(25 * 1024 * 1024), 'image/jpeg', 'IMAGE_TOO_LARGE'],
    ['a renamed text file', () => text('hello, I am a .jpg'), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
    ['a HEIC photo', () => heicHeader(), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
    ['a disallowed content type', () => new Uint8Array(10), 'application/pdf', 'IMAGE_UNSUPPORTED'],
    ['a truncated JPEG', () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
  ])('rejects %s with 422 and deletes the object', async (_, body, type, code) => {
    const { store, objects, upload } = createMemoryStore()
    upload(KEY, body(), type)
    const error = await loadInputImage(store, KEY).catch((e: unknown) => e)
    expect(error).toMatchObject({ code, status: 422 })
    expect(objects.has(KEY)).toBe(false)
  })

  it('reports a missing upload without deleting anything', async () => {
    const { store } = createMemoryStore()
    await expect(loadInputImage(store, KEY)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('shrinks a fallback original to a 2048 JPEG without EXIF', async () => {
    const { store, upload } = createMemoryStore()
    upload(KEY, await jpeg(4000, 3000, { exif: true }), 'image/jpeg')
    const image = await loadInputImage(store, KEY)
    const meta = await sharp(image.bytes).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 2048, height: 1536 })
    expect(meta.exif).toBeUndefined()
    // Reported for 'original' outputs, which follow the photo's ratio.
    expect(image).toMatchObject({ width: 2048, height: 1536 })
  })

  it('accepts a PNG upload and keeps small images at their size', async () => {
    const { store, upload } = createMemoryStore()
    upload(KEY, await png(800, 600), 'image/png')
    const meta = await sharp((await loadInputImage(store, KEY)).bytes).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 800, height: 600 })
  })
})
