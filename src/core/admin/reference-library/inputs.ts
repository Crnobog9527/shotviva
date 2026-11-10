import { z } from 'zod'

import { AppError } from '@/core/errors'
import { CATEGORY_KEY_PATTERN, CATEGORY_LIMITS } from '@/core/templates/categories'

export const categoryKey = z.string().max(CATEGORY_LIMITS.key).regex(CATEGORY_KEY_PATTERN)
export const assetId = z.uuid()
const tag = z.string().trim().min(1).max(64)
const tags = z.array(tag).max(32).transform(values => [...new Set(values)])
export const listInput = z.object({
  status: z.enum(['active', 'archived']).default('active'),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  categoryId: categoryKey.optional(),
  tag: tag.optional(),
  note: z.string().trim().min(1).max(2000).optional(),
  cursor: z.string().max(300).optional(),
})
export const editInput = z.object({
  categoryId: categoryKey,
  sourceUrl: z.httpUrl().max(2048).nullable(),
  note: z.string().trim().max(2000).nullable(),
  tags,
})
const batch = z.object({
  ids: z.array(assetId).min(1).max(200).refine(values => new Set(values).size === values.length),
})
export const batchInput = z.discriminatedUnion('operation', [
  batch.extend({ operation: z.literal('move'), categoryId: categoryKey }),
  batch.extend({ operation: z.enum(['add-tags', 'remove-tags']), tags: tags.refine(v => v.length > 0) }),
  batch.extend({ operation: z.enum(['archive', 'restore', 'delete']) }),
])
const parentId = categoryKey.nullable()
const names = z.object({
  parentId, nameZh: z.string().trim().min(1).max(CATEGORY_LIMITS.nameZh),
  nameEn: z.string().trim().min(1).max(CATEGORY_LIMITS.nameEn),
})
export const categoryInput = z.discriminatedUnion('op', [
  names.extend({ op: z.literal('create') }),
  names.extend({ op: z.literal('rename'), key: categoryKey }),
  z.object({ op: z.literal('move'), key: categoryKey, fromParent: parentId, parentId, beforeKey: parentId }),
  z.object({ op: z.literal('delete'), key: categoryKey, moveTo: parentId }),
])

export function readInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new AppError('INVALID_INPUT', '填写的内容不符合要求，请检查后重试')
  return result.data
}
