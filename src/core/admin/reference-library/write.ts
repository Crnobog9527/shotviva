import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { categoryRpcError } from '../template-categories/errors'
import { assetId, batchInput, categoryInput, editInput, readInput } from './inputs'

async function mutate(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await db.rpc(fn, args)
  if (!error) return
  switch (error.message) {
    case 'REFERENCE_NOT_FOUND': throw new AppError('NOT_FOUND', '素材已被删除，请刷新后重试')
    case 'REFERENCE_NOT_ARCHIVED': throw new AppError('CONFLICT', '只能永久删除已归档的素材')
    case 'CATEGORY_MOVE_REQUIRED': throw new AppError('INVALID_INPUT', '请选择接收素材的分类')
    default: throw categoryRpcError(fn, error)
  }
}

export async function changeReferenceCategory(db: SupabaseClient, actor: string, input: unknown) {
  const p = readInput(categoryInput, input)
  if (p.op === 'delete') return mutate(db, 'admin_delete_reference_category', { p_actor: actor, p_key: p.key, p_move_to: p.moveTo })
  if (p.op === 'move') return mutate(db, 'admin_move_reference_category', {
    p_actor: actor, p_key: p.key, p_from_parent: p.fromParent, p_parent: p.parentId, p_before: p.beforeKey,
  })
  return mutate(db, 'admin_save_reference_category', {
    p_actor: actor, p_key: p.op === 'rename' ? p.key : 'ref-' + randomUUID(),
    p_name_en: p.nameEn, p_name_zh: p.nameZh, p_parent: p.parentId, p_is_new: p.op === 'create',
  })
}

export async function editReference(db: SupabaseClient, actor: string, id: string, input: unknown) {
  const p = readInput(editInput, input)
  return mutate(db, 'admin_edit_reference_asset', {
    p_actor: actor, p_id: readInput(assetId, id),
    p_fields: { source_url: p.sourceUrl, note: p.note || null, tags: p.tags, category_id: p.categoryId },
  })
}

export async function batchReferences(db: SupabaseClient, actor: string, input: unknown) {
  const p = readInput(batchInput, input)
  const value = 'tags' in p ? p.tags : 'categoryId' in p ? p.categoryId : null
  await mutate(db, 'admin_bulk_reference_assets', {
    p_actor: actor, p_ids: p.ids, p_action: p.operation.replace('-', '_'), p_value: value,
  })
  return p.operation
}
