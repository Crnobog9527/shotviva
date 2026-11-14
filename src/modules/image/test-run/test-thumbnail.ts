import 'server-only'

import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'
import { isTestPhotoKey, testOutputKey } from './test-run-keys'

export const thumbnailKey = (key: string) => `${key}.thumb.webp`

export async function writeThumbnail(store: ObjectStore, key: string, bytes: Uint8Array) {
  // Decode limits also apply to historical uploads that predate thumbnail generation.
  const webp = await sharp(bytes, { limitInputPixels: 64_000_000 }).rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer()
  await store.put(thumbnailKey(key), webp, 'image/webp')
}

export async function storeTestOutput(store: ObjectStore, key: string, output: { bytes: Uint8Array; contentType: string }) {
  // Both writes start in the provider completion path. A paid original can still settle if
  // its derivative alone failed: the next admin view repairs it from the stored bytes.
  const [original, thumbnail] = await Promise.allSettled([
    store.put(key, output.bytes, output.contentType),
    writeThumbnail(store, key, output.bytes),
  ])
  if (original.status === 'rejected') {
    // Both writes have finished. Clean only this attempt, including an unacknowledged PUT.
    const removed = await Promise.allSettled([store.delete(key), store.delete(thumbnailKey(key))])
    if (removed.some(result => result.status === 'rejected')) logger.warn('trial output rollback failed', { key })
    throw original.reason
  }
  if (thumbnail.status === 'rejected') logger.warn('test run thumbnail deferred', { key })
}

export async function historicalThumbnail(store: ObjectStore, findKey: () => Promise<string | null>) {
  const key = await findKey()
  if (!key) return null
  const thumb = thumbnailKey(key)
  if (!await store.head(thumb)) {
    await writeThumbnail(store, key, await store.get(key))
    let stillPresent = false
    try {
      stillPresent = await findKey() === key
    } finally {
      if (!stillPresent) await store.delete(thumb)
    }
    if (!stillPresent) return null
  }
  // A distinct signature bypasses any cached 404 for the first, 600-second URL.
  return store.presignGet(thumb, { expiresInSeconds: 599 })
}

export async function thumbnailForAsset(db: SupabaseClient, store: ObjectStore, kind: 'run' | 'photo', id: string, mode: 'read' | 'repair') {
  const findKey = async () => {
    const query = kind === 'photo'
      ? db.from('admin_test_photos').select('key:object_key')
      : db.from('admin_test_runs').select('key:output_key')
    const { data, error } = await query.eq('id', id).maybeSingle()
    if (error) throw new AppError('INTERNAL', '读取缩略图失败', { cause: error })
    const key = data?.key
    if (!key) return null
    return (kind === 'photo' ? isTestPhotoKey(id, key) : key === testOutputKey(id)) ? key : null
  }
  if (mode === 'repair') return historicalThumbnail(store, findKey)
  const key = await findKey()
  if (!key) return null
  const thumb = thumbnailKey(key)
  return store.presignGet(await store.head(thumb) ? thumb : key, { expiresInSeconds: 600 })
}
