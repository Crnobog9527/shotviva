import sharp from 'sharp'
import { expect, it, vi } from 'vitest'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { historicalThumbnail, storeTestOutput, thumbnailKey, writeThumbnail } from './test-thumbnail'

it('stores a private WebP scaled to 512px and keeps the full-size original', async () => {
  const { store } = createMemoryStore()
  const bytes = await sharp({ create: { width: 1000, height: 500, channels: 3, background: 'red' } }).png().toBuffer()
  await store.put('photo', bytes, 'image/png')
  await writeThumbnail(store, 'photo', bytes)
  expect(await sharp(await store.get(thumbnailKey('photo'))).metadata()).toMatchObject({ width: 512, height: 256, format: 'webp' })
  expect(await store.get('photo')).toEqual(bytes)
})

it('removes a historical thumbnail when its photo disappears during conversion', async () => {
  const { store } = createMemoryStore()
  const small = await sharp({ create: { width: 8, height: 16, channels: 3, background: 'red' } }).png().toBuffer()
  await store.put('photo', small, 'image/png')
  let reads = 0
  expect(await historicalThumbnail(store, async () => ++reads === 1 ? 'photo' : null)).toBeNull()
  expect(await store.head(thumbnailKey('photo'))).toBeNull()
})

it('publishes the original and WebP together on a successful provider write', async () => {
  const { store } = createMemoryStore()
  const bytes = await sharp({ create: { width: 8, height: 16, channels: 3, background: 'red' } }).png().toBuffer()
  await storeTestOutput(store, 'output', { bytes, contentType: 'image/png' })
  expect(await store.get('output')).toEqual(bytes)
  expect(await store.head(thumbnailKey('output'))).toMatchObject({ contentType: 'image/webp' })
})

it('writes the derived WebP while the original PUT is still in flight', async () => {
  const { store } = createMemoryStore()
  const bytes = await sharp({ create: { width: 8, height: 16, channels: 3, background: 'red' } }).png().toBuffer()
  const originalGate = Promise.withResolvers<void>()
  const put = store.put
  vi.spyOn(store, 'put').mockImplementation(async (key, body, type) => {
    if (key === 'output') await originalGate.promise
    await put(key, body, type)
  })
  const finished = storeTestOutput(store, 'output', { bytes, contentType: 'image/png' })
  try {
    await vi.waitFor(async () => expect(await store.head(thumbnailKey('output'))).toMatchObject({ contentType: 'image/webp' }))
    expect(await store.head('output')).toBeNull()
  } finally {
    originalGate.resolve()
    await finished
  }
  expect(await store.get('output')).toEqual(bytes)
})

it('preserves the paid original if only the derivative failed and repairs it on demand', async () => {
  const { store } = createMemoryStore()
  const bytes = await sharp({ create: { width: 8, height: 16, channels: 3, background: 'red' } }).png().toBuffer()
  const put = store.put
  const spy = vi.spyOn(store, 'put').mockImplementation(async (key, body, type) => {
    if (key === thumbnailKey('output')) throw new Error('thumbnail write failed')
    await put(key, body, type)
  })
  await storeTestOutput(store, 'output', { bytes, contentType: 'image/png' })
  expect(await store.get('output')).toEqual(bytes)
  expect(await store.head(thumbnailKey('output'))).toBeNull()
  spy.mockRestore()
  expect(await historicalThumbnail(store, async () => 'output')).toContain('output.thumb.webp')
  expect(await store.head(thumbnailKey('output'))).toMatchObject({ contentType: 'image/webp' })
})

it('removes an original whose PUT reached the store but acknowledgement failed', async () => {
  const { store } = createMemoryStore()
  const put = store.put
  vi.spyOn(store, 'put').mockImplementation(async (key, body, type) => {
    await put(key, body, type)
    throw new Error('lost acknowledgement')
  })
  await expect(storeTestOutput(store, 'output', { bytes: Buffer.from('output'), contentType: 'image/png' })).rejects.toThrow()
  expect(await store.head('output')).toBeNull()
  expect(await store.head(thumbnailKey('output'))).toBeNull()
})
