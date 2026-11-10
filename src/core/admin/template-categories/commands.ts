import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { moveSchema, nodeSchema } from './tree-input'

import * as repo from './repository'

// Validation for the 分类管理 panel (ARCHITECTURE §5 「模板分类由后台管理」). Callers pass a
// service-role client and the admin's id after requireAdmin(); every rule is checked again in
// the SQL function, which also re-checks the admin role.

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new AppError('INVALID_INPUT', message)
  return result.data
}

const saveSchema = z.object({ isNew: z.boolean(), category: nodeSchema })

export async function saveTemplateCategory(client: SupabaseClient, adminId: string, payload: unknown): Promise<void> {
  const { isNew, category } = parseOrThrow(saveSchema, payload, '名称、标识或说明不符合要求，请检查后再保存')
  await repo.saveCategory(client, adminId, category, isNew)
  logger.info('admin.template_category.saved', { adminId, key: category.key, isNew })
}

const keysSchema = z
  .array(z.string().min(1).max(40))
  .min(1)
  .max(200)
  .refine((keys) => new Set(keys).size === keys.length)

export async function reorderTemplateCategories(client: SupabaseClient, adminId: string, keys: unknown): Promise<void> {
  const parsed = parseOrThrow(keysSchema, keys, '排序不完整，请刷新页面后再试')
  await repo.reorderCategories(client, adminId, parsed)
  logger.info('admin.template_category.reordered', { adminId, count: parsed.length })
}

const deleteSchema = z
  .object({ key: z.string().min(1).max(40), moveTo: z.string().min(1).max(40).nullable() })
  .refine((input) => input.moveTo !== input.key)

// Templates using the category (published or not) move to `moveTo` in the same transaction.
export async function deleteTemplateCategory(client: SupabaseClient, adminId: string, payload: unknown): Promise<{ moved: number }> {
  const { key, moveTo } = parseOrThrow(deleteSchema, payload, '请选择另一个分类来接收这些模板')
  const moved = await repo.deleteCategory(client, adminId, key, moveTo)
  logger.info('admin.template_category.deleted', { adminId, key, moveTo, moved })
  return { moved }
}

export async function moveTemplateCategory(client: SupabaseClient, actor: string, input: unknown): Promise<void> {
  const move = parseOrThrow(moveSchema, input, '移动目标不正确，请刷新后重试')
  await repo.moveCategory(client, actor, move)
}
