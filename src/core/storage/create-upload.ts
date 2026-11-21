import 'server-only'

import { z } from 'zod'

import { AppError } from '../errors'
import { newInputKey } from './keys'
import type { ObjectStore } from './object-store'
import { BATCH_UPLOAD_TICKETS_MAX, BATCH_UPLOAD_URL_TTL_SECONDS, isUploadContentType, MAX_UPLOAD_BYTES, UPLOAD_URL_TTL_SECONDS, type UploadContentType } from './rules'

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

export const batchUploadRequestSchema = z.object({
  content_type: z.string(),
  count: z.number().int().min(1).max(BATCH_UPLOAD_TICKETS_MAX),
})

// Several tickets in one request (queue-fairness plan §5): a batch of photos asks once per ten
// instead of once per photo, so an office behind one IP stays far under the firewall's per-IP
// limit. Same rules as createUpload: the server picks every key, the content type is signed. No
// size is declared (the browser has not compressed the later photos yet); the ≤20MB pick check
// runs in the browser and /api/generate re-checks every stored object with HEAD, as for single
// tickets. An unused ticket is just an unused signature: nothing is written until a PUT.
export async function createUploads(store: ObjectStore, userId: string, body: unknown): Promise<{ tickets: UploadTicket[] }> {
  const parsed = batchUploadRequestSchema.safeParse(body)
  if (!parsed.success) throw new AppError('INVALID_INPUT', `content_type and a count of 1 to ${BATCH_UPLOAD_TICKETS_MAX} are required`)
  const { content_type: contentType, count } = parsed.data
  if (!isUploadContentType(contentType)) throw new AppError('IMAGE_UNSUPPORTED', 'Please use a JPEG, PNG or WebP photo')
  const tickets = await Promise.all(Array.from({ length: count }, async () => {
    const key = newInputKey(userId, contentType)
    const url = await store.presignPut(key, contentType, BATCH_UPLOAD_URL_TTL_SECONDS)
    return { input_key: key, put_url: url, headers: { 'Content-Type': contentType }, expires_in: BATCH_UPLOAD_URL_TTL_SECONDS }
  }))
  return { tickets }
}
