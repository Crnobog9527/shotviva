import sharp from 'sharp'
import { expect, it } from 'vitest'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { historicalThumbnail, thumbnailKey, writeThumbnail } from './test-thumbnail'

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
