import 'server-only'

import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'

export const thumbnailKey = (key: string) => `${key}.thumb.webp`

export async function writeThumbnail(store: ObjectStore, key: string, bytes: Uint8Array) {
  // Decode limits also apply to historical uploads that predate thumbnail generation.
  const webp = await sharp(bytes, { limitInputPixels: 64_000_000 }).rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer()
  await store.put(thumbnailKey(key), webp, 'image/webp')
}

export async function historicalThumbnail(store: ObjectStore, findKey: () => Promise<string | null>) {
  const key = await findKey()
  if (!key) return null
  const thumb = thumbnailKey(key)
  if (!await store.head(thumb)) {
    await writeThumbnail(store, key, await store.get(key))
    if (await findKey() !== key) {
      await store.delete(thumb)
      return null
    }
  }
  return store.presignGet(thumb, { expiresInSeconds: 600 })
}


export async function thumbnailForAsset(db: SupabaseClient, store: ObjectStore, kind: 'run' | 'photo', id: string) {
  const findKey = async () => {
    const query = kind === 'photo'
      ? db.from('admin_test_photos').select('key:object_key')
      : db.from('admin_test_runs').select('key:output_key')
    const { data, error } = await query.eq('id', id).maybeSingle()
    if (error) throw new AppError('INTERNAL', '读取缩略图失败', { cause: error })
    return data?.key ?? null
  }
  return historicalThumbnail(store, findKey)
}
