import 'server-only'

import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { sniffImageType, type ObjectHead, type ObjectStore } from '@/core/storage'
import { STYLE_REF_EDGE, type StyleRef } from '@/core/templates/style-refs'
import { afterCoverRefId, COVER_STILL_TYPES, MAX_COVER_IMAGE_BYTES, requireCurrentStillCover } from '../covers'

const templateId = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const upload = z.object({ templateId, contentType: z.enum(COVER_STILL_TYPES), size: z.int().positive().max(MAX_COVER_IMAGE_BYTES) })
const finish = z.object({ templateId, uploadId: z.uuidv4() })
const stagedKey = (id: string, uploadId: string) => `uploads-admin/style-refs/${id}/${uploadId}`

export async function stageStyleRef(store: ObjectStore, input: unknown) {
  const parsed = upload.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请上传不超过 20MB 的 JPEG、PNG 或 WebP 图片')
  const { templateId: id, contentType } = parsed.data
  const uploadId = randomUUID()
  const putUrl = await store.presignPut(stagedKey(id, uploadId), contentType, 300)
  return { uploadId, putUrl, headers: { 'Content-Type': contentType } }
}

async function encodeReference(bytes: Uint8Array) {
  try {
    return await sharp(bytes, { limitInputPixels: 120_000_000 }).rotate()
      .resize({ width: STYLE_REF_EDGE, height: STYLE_REF_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 }).toBuffer({ resolveWithObject: true })
  } catch {
    throw new AppError('INVALID_INPUT', '图片无法解码，请换一个文件')
  }
}

export async function finishStyleRef(store: ObjectStore, input: unknown): Promise<StyleRef> {
  const parsed = finish.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '上传参数不对')
  const { templateId: id, uploadId } = parsed.data
  const staged = stagedKey(id, uploadId)
  const head = await readImageHead(store, staged)
  try {
    return await storeReference(store, staged, head, store, id, randomUUID())
  } finally {
    // Staging also has a seven-day lifecycle. A retry can never overwrite a saved reference.
    await store.delete(staged).catch(() => {})
  }
}

async function readImageHead(store: ObjectStore, key: string) {
  const head = await store.head(key)
  if (!head) throw new AppError('INVALID_INPUT', '找不到图片，请重新上传')
  return head
}

async function storeReference(source: ObjectStore, sourceKey: string, head: ObjectHead,
  destination: ObjectStore, id: string, imageId: string): Promise<StyleRef> {
  if (head.size < 1 || head.size > MAX_COVER_IMAGE_BYTES) throw new AppError('INVALID_INPUT', '图片大小不对')
  const bytes = await source.get(sourceKey)
  const actualType = sniffImageType(bytes)
  if (bytes.length !== head.size || !actualType || !COVER_STILL_TYPES.some(t => t === actualType && t === head.contentType)) {
    throw new AppError('INVALID_INPUT', '文件类型或大小不对')
  }
  const { key, width, height, data } = await encodeStyleRef(id, imageId, bytes)
  await destination.put(key, data, 'image/webp')
  return { key, width, height, uploadedAt: new Date().toISOString() }
}

// The stored reference for these bytes, as an upload makes it; `pnpm templates:apply` encodes a
// local file with this before it puts the result in the private bucket itself.
export async function encodeStyleRef(id: string, imageId: string, bytes: Uint8Array) {
  const { data, info } = await encodeReference(bytes)
  return { key: `style-refs/${id}/${imageId}.webp`, width: info.width, height: info.height, data }
}

const reuse = z.strictObject({ templateId, locale: z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/).nullable(), hash: z.string().regex(/^[0-9a-f]{16}([0-9a-f]{48})?$/) })

export async function reuseCoverStyleRef(db: SupabaseClient, assets: ObjectStore, store: ObjectStore, input: unknown) {
  const parsed = reuse.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '封面参数不对')
  const { templateId: id, locale, hash } = parsed.data
  const source = await requireCurrentStillCover(db, id, locale, 'after', hash)
  const head = await readImageHead(assets, source.key)
  return storeReference(assets, source.key, head, store, id, afterCoverRefId(hash, randomUUID()))
}

const styleRefPreviewSchema = z.object({ templateId, imageId: z.uuidv4() })

export async function styleRefPreview(store: ObjectStore, input: unknown) {
  const parsed = styleRefPreviewSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '参考图地址不对')
  const { templateId, imageId } = parsed.data
  return store.presignGet(`style-refs/${templateId}/${imageId}.webp`, { expiresInSeconds: 60 })
}
