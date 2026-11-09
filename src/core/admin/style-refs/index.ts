import 'server-only'

import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { sniffImageType, type ObjectStore } from '@/core/storage'
import { STYLE_REF_EDGE, type StyleRef } from '@/core/templates/style-refs'
import { COVER_STILL_TYPES, MAX_COVER_IMAGE_BYTES } from '../covers/cover-rules'

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
  const head = await store.head(staged)
  if (!head) throw new AppError('INVALID_INPUT', '找不到上传的图片，请重新上传')
  try {
    if (head.size < 1 || head.size > MAX_COVER_IMAGE_BYTES) throw new AppError('INVALID_INPUT', '图片大小不对')
    const bytes = await store.get(staged)
    const actualType = sniffImageType(bytes)
    if (bytes.length !== head.size || !actualType || !COVER_STILL_TYPES.some(t => t === actualType && t === head.contentType)) {
      throw new AppError('INVALID_INPUT', '文件类型或大小不对')
    }
    const { data, info } = await encodeReference(bytes)
    const key = `style-refs/${id}/${randomUUID()}.webp`
    await store.put(key, data, 'image/webp')
    return { key, width: info.width, height: info.height, uploadedAt: new Date().toISOString() }
  } finally {
    // Staging also has a seven-day lifecycle. A retry can never overwrite a saved reference.
    await store.delete(staged).catch(() => {})
  }
}

const styleRefPreviewSchema = z.object({ templateId, imageId: z.uuidv4() })

export async function styleRefPreview(store: ObjectStore, input: unknown) {
  const parsed = styleRefPreviewSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '参考图地址不对')
  const { templateId, imageId } = parsed.data
  return store.presignGet(`style-refs/${templateId}/${imageId}.webp`, { expiresInSeconds: 60 })
}
