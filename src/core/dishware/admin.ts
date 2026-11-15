import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { z } from 'zod'

import { callRpc } from '../billing/rpc'
import { AppError } from '../errors'
import { logger } from '../logger'
import { sniffImageType, type ObjectStore } from '../storage'
import { DISHWARE_COLUMNS, DISHWARE_EDGE, dishwareInputSchema, dishwareKey, dishwareRowSchema, toDishwareItem, type DishwareItem } from './types'

// Admin writes of the vessel library (ARCHITECTURE §5.1c「器皿图库」). The image goes the way a
// style reference does (§8.1): the browser PUTs to a staging key, the server re-encodes it into the
// private bucket. Rows change only through admin_save_dishware / admin_delete_dishware (1557).

const STILL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES = 20 * 1024 * 1024
// Dark studio backgrounds: an image with alpha is flattened onto near-black, never onto white.
const MATTE = { r: 24, g: 24, b: 26 }

const upload = z.object({ contentType: z.enum(STILL_TYPES), size: z.int().positive().max(MAX_BYTES) })
const finish = z.object({ id: z.uuidv4(), uploadId: z.uuidv4() })
const stagedKey = (id: string, uploadId: string) => `uploads-admin/dishware/${id}/${uploadId}`

export async function listDishware(db: SupabaseClient): Promise<DishwareItem[]> {
  const { data, error } = await db.from('dishware_library').select(DISHWARE_COLUMNS).order('category').order('label')
  if (error) throw new AppError('INTERNAL', `dishware list failed: ${error.message}`)
  return z.array(dishwareRowSchema).parse(data).map(toDishwareItem)
}

// A new vessel gets its id here, so its image key can carry it.
export async function stageDishware(store: ObjectStore, input: unknown) {
  const parsed = upload.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请上传不超过 20MB 的 JPEG、PNG 或 WebP 图片')
  const id = randomUUID()
  const uploadId = randomUUID()
  const putUrl = await store.presignPut(stagedKey(id, uploadId), parsed.data.contentType, 300)
  return { id, uploadId, putUrl, headers: { 'Content-Type': parsed.data.contentType } }
}

// The stored image for these bytes; `pnpm dishware:import` uses the same encoding.
export async function encodeDishware(id: string, bytes: Uint8Array) {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 120_000_000 }).rotate().flatten({ background: MATTE })
      .resize({ width: DISHWARE_EDGE, height: DISHWARE_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 }).toBuffer({ resolveWithObject: true })
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 16)
    return { key: dishwareKey(id, hash), width: info.width, height: info.height, data }
  } catch {
    throw new AppError('INVALID_INPUT', '图片无法解码，请换一个文件')
  }
}

export async function finishDishware(store: ObjectStore, input: unknown) {
  const parsed = finish.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '上传参数不对')
  const staged = stagedKey(parsed.data.id, parsed.data.uploadId)
  try {
    const head = await store.head(staged)
    if (!head || head.size < 1 || head.size > MAX_BYTES) throw new AppError('INVALID_INPUT', '找不到图片，请重新上传')
    const bytes = await store.get(staged, MAX_BYTES)
    const type = sniffImageType(bytes)
    if (bytes.length !== head.size || !type || !STILL_TYPES.some((t) => t === type)) throw new AppError('INVALID_INPUT', '文件类型或大小不对')
    const encoded = await encodeDishware(parsed.data.id, bytes)
    await store.put(encoded.key, encoded.data, 'image/webp')
    return { id: parsed.data.id, imageKey: encoded.key, width: encoded.width, height: encoded.height }
  } finally {
    await store.delete(staged).catch(() => {})
  }
}

const savedSchema = z.object({ previous_key: z.string().nullable() })

// Create or edit one vessel. A replaced image's old object is deleted after the row moved on.
export async function saveDishware(deps: { db: SupabaseClient; store: ObjectStore }, actorId: string, input: unknown): Promise<void> {
  const parsed = dishwareInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '器皿信息不完整：名称、类别、形状描述和图片都要有')
  const item = parsed.data
  const saved = await callRpc(deps.db, 'admin_save_dishware', {
    p_item: { id: item.id, label: item.label, category: item.category, shape: item.shape, image_key: item.imageKey, width: item.width, height: item.height, is_active: item.isActive },
    p_actor: actorId,
  }, savedSchema)
  await dropObject(deps.store, saved.previous_key !== item.imageKey ? saved.previous_key : null)
}

export async function deleteDishware(deps: { db: SupabaseClient; store: ObjectStore }, actorId: string, id: unknown): Promise<void> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '器皿编号不对')
  const key = await callRpc(deps.db, 'admin_delete_dishware', { p_id: parsed.data, p_actor: actorId }, z.string())
  await dropObject(deps.store, key)
}

// A failed delete only leaves an unreferenced object behind; the row is already right.
async function dropObject(store: ObjectStore, key: string | null) {
  if (!key) return
  await store.delete(key).catch((error: unknown) => logger.warn('dishware.object_not_deleted', { key, error }))
}

const previewSchema = z.object({ key: z.string().regex(/^dishware\/[0-9a-f-]{36}-[0-9a-f]{16}\.webp$/) })

export async function dishwarePreview(store: ObjectStore, input: unknown) {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '图片地址不对')
  return store.presignGet(parsed.data.key, { expiresInSeconds: 60 })
}
