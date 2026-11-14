import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'
import { isUploadContentType, MAX_UPLOAD_BYTES, UPLOAD_URL_TTL_SECONDS } from '@/core/storage/rules'

import { writeThumbnail } from './test-thumbnail'
import { isTestPhotoKey, newTestPhotoKey } from './test-run-keys'
import { testPhotoTicketSchema } from './test-run-request'
import type { TestPhoto } from './test-run-row'
import { insertTestPhoto } from './test-run-store'

// Test photos (ARCHITECTURE §10.b): uploaded like a user's photo (browser compression, then a
// presigned PUT straight to R2, never through a function, §8.1) but to admin-tests/photos/, and
// listed under 「最近用过的测试照片」 once the PUT is confirmed. The bytes are checked when a run
// reads them (loadInputImage: HEAD, magic number, decode), as for a user's upload.

export type TestPhotoTicket = { photo_id: string; key: string; put_url: string; headers: { 'Content-Type': string } }

export async function createTestPhotoUpload(store: ObjectStore, body: unknown): Promise<TestPhotoTicket> {
  const parsed = testPhotoTicketSchema.safeParse(body)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'content_type and size are required')
  const { content_type: contentType, size } = parsed.data
  if (!isUploadContentType(contentType)) throw new AppError('IMAGE_UNSUPPORTED', '只收 JPEG、PNG 或 WebP')
  if (size > MAX_UPLOAD_BYTES) throw new AppError('IMAGE_TOO_LARGE', '照片不能超过 20MB')
  const { photoId, key } = newTestPhotoKey(contentType)
  const putUrl = await store.presignPut(key, contentType, UPLOAD_URL_TTL_SECONDS)
  return { photo_id: photoId, key, put_url: putUrl, headers: { 'Content-Type': contentType } }
}

// After the PUT: the object is there and is this photo's, then the row that lists it.
export async function confirmTestPhoto(deps: { db: SupabaseClient; store: ObjectStore }, actorId: string, photoId: string, key: string): Promise<TestPhoto> {
  if (!isTestPhotoKey(photoId, key)) throw new AppError('INVALID_INPUT', '上传的文件不属于这张测试照片')
  const head = await deps.store.head(key)
  if (!head) throw new AppError('INVALID_INPUT', '没找到上传的照片，请重新上传')
  if (head.size > MAX_UPLOAD_BYTES) {
    await deps.store.delete(key).catch(() => undefined)
    throw new AppError('IMAGE_TOO_LARGE', '照片不能超过 20MB')
  }
  await writeThumbnail(deps.store, key, await deps.store.get(key))
  return insertTestPhoto(deps.db, { id: photoId, objectKey: key, actorId })
}
