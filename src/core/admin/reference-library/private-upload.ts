import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage/object-store'
import { UPLOAD_URL_TTL_SECONDS } from '@/core/storage/rules'
import { removeReferenceObjects } from './object-cleanup'
import { registeredReference, uploadCompletion, uploadDescription } from './upload-schema'
import { readReferenceUpload } from './validate-object'

const stagingKey = (actor: string, id: string) => `uploads-admin/references/${actor}/${id}.webp`

export async function stageReference(db: SupabaseClient, store: ObjectStore, actor: string, input: unknown) {
  const parsed = uploadDescription.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '素材大小、摘要或分类无效')
  const { data, error } = await db.from('reference_assets').select('id,status').eq('sha256', parsed.data.sha256).maybeSingle()
  if (error) throw new AppError('INTERNAL', '暂时无法检查重复素材')
  if (data) return registeredReference.parse({ ...data, duplicate: true })
  const uploadId = randomUUID()
  const putUrl = await store.presignPut(stagingKey(actor, uploadId), 'image/webp', UPLOAD_URL_TTL_SECONDS)
  return { uploadId, putUrl }
}

export async function finishReference(db: SupabaseClient, store: ObjectStore, actor: string, input: unknown) {
  const parsed = uploadCompletion.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '上传信息无效')
  const staged = stagingKey(actor, parsed.data.uploadId)
  try {
    const image = await readReferenceUpload(store, staged, parsed.data)
    const id = randomUUID()
    const reserved = await db.rpc('admin_reserve_reference_upload', { p_actor: actor, p_id: id })
    if (reserved.error) throw new AppError('INTERNAL', '无法预留素材位置')
    // Copy only the exact bytes inspected above. The presigned PUT can overwrite staging
    // during this request, so a server-side copy of the staging key would be unsafe.
    await store.put(`references/${id}.webp`, image.body, 'image/webp', { cacheControl: 'private, no-store' })
    const { data, error } = await db.rpc('admin_register_reference_asset', {
      p_actor: actor, p_asset: { id, category_id: parsed.data.categoryId, width: image.width,
        height: image.height, bytes: image.body.length, sha256: image.sha256 },
    })
    if (error) throw new AppError('INVALID_INPUT', '素材未确认入库，请刷新分类后重试')
    const result = registeredReference.parse(data)
    if (result.duplicate && result.id !== id) {
      await removeReferenceObjects(db, actor, store, [`references/${id}.webp`]).catch(() => logger.warn('reference cleanup deferred'))
    }
    return result
  } finally {
    await store.delete(staged).catch(() => logger.warn('reference staging cleanup deferred'))
  }
}
