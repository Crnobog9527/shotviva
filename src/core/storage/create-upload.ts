import 'server-only'

import { z } from 'zod'

import { AppError } from '../errors'
import { newInputKey } from './keys'
import type { ObjectStore } from './object-store'
import { isUploadContentType, MAX_UPLOAD_BYTES, UPLOAD_URL_TTL_SECONDS, type UploadContentType } from './rules'

export const uploadRequestSchema = z.object({
  content_type: z.string(),
  size: z.number().int().positive(),
})

export type UploadTicket = {
  input_key: string
  put_url: string
  // The PUT must send exactly these headers or the signature fails.
  headers: { 'Content-Type': UploadContentType }
  expires_in: number
}

// Hands out a 60-second presigned PUT for a key the server chose (users can never pick a
// path). The declared size is checked here for a fast answer, but the PUT cannot enforce
// it, so /api/generate re-checks the stored object with HEAD (ARCHITECTURE §8.2).
export async function createUpload(store: ObjectStore, userId: string, body: unknown): Promise<UploadTicket> {
  const parsed = uploadRequestSchema.safeParse(body)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'content_type and size are required')
  const { content_type: contentType, size } = parsed.data
  if (!isUploadContentType(contentType)) throw new AppError('IMAGE_UNSUPPORTED', 'Please use a JPEG, PNG or WebP photo')
  if (size > MAX_UPLOAD_BYTES) throw new AppError('IMAGE_TOO_LARGE', 'Photo is larger than 20MB')

  const key = newInputKey(userId, contentType)
  const url = await store.presignPut(key, contentType, UPLOAD_URL_TTL_SECONDS)
  return { input_key: key, put_url: url, headers: { 'Content-Type': contentType }, expires_in: UPLOAD_URL_TTL_SECONDS }
}
