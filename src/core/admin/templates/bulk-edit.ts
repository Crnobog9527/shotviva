import 'server-only'

import type { ProviderFloors } from '@/core/templates/provider-pricing'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { LOCALES } from '@/core/i18n/locales'
import { logger } from '@/core/logger'
import { TEMPLATE_QUALITIES } from '@/core/templates/pricing'
import { TEMPLATE_SURFACES } from '@/core/templates/schema'

import { isEmptyPatch, type BulkEditFailure, type BulkEditOutcome, type BulkEditPatch } from './bulk-edit-rules'

// Batch edit (T79): validated here, then one call to admin_bulk_edit_templates (0825), which
// checks every template against the floor and writes the whole batch in one transaction, or
// nothing. The floor table is the server's (modules/image), never the client's.

const tier = z.number().int().min(1).max(999)
const inputSchema = z.object({
  ids: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, 'ids must be unique'),
  patch: z
    .strictObject({
      creditsCost: z.strictObject({ '1k': tier.optional(), '2k': tier.optional(), '3k': tier.optional() }).optional(),
      visibleIn: z
        .array(z.enum(TEMPLATE_SURFACES))
        .min(1)
        .refine((surfaces) => new Set(surfaces).size === surfaces.length, 'surfaces must be unique')
        .optional(),
      quality: z.enum(TEMPLATE_QUALITIES).optional(),
      // A template_categories key (T75); the SQL function refuses unknown and system ones.
      categoryKey: z.string().min(1).max(40).optional(),
    })
    .refine((patch) => !isEmptyPatch(patch), '至少改一项'),
})

const resultSchema = z.object({
  changed: z.number().int().optional(),
  failures: z.array(
    z.union([
      z.object({
        id: z.string(),
        name: z.string(),
        reason: z.literal('below_floor'),
        resolution: z.enum(['1k', '2k', '3k']),
        floor: z.number(),
        given: z.number(),
      }),
      z.object({ id: z.string(), name: z.string(), reason: z.enum(['web_incomplete', 'not_found', 'system']) }),
    ]),
  ),
})

const toSqlPatch = (patch: BulkEditPatch) => ({
  ...(patch.creditsCost && Object.keys(patch.creditsCost).length > 0 ? { credits_cost: patch.creditsCost } : {}),
  ...(patch.visibleIn ? { visible_in: patch.visibleIn } : {}),
  ...(patch.quality ? { quality: patch.quality } : {}),
  ...(patch.categoryKey ? { category_key: patch.categoryKey } : {}),
})

const SQL_ERRORS: Record<string, [code: 'FORBIDDEN' | 'INVALID_INPUT', message: string]> = {
  NOT_ADMIN: ['FORBIDDEN', '只有管理员能批量编辑模板'],
  INVALID_INPUT: ['INVALID_INPUT', '批量编辑的内容不完整，请刷新页面后再试'],
  MODEL_CHANGED: ['INVALID_INPUT', '出图模型有变化，请刷新后重试'],
  CATEGORY_NOT_FOUND: ['INVALID_INPUT', '选的分类不存在或已被删除，请刷新页面后再选'],
}

export async function bulkEditTemplates(
  client: SupabaseClient,
  adminId: string,
  input: unknown,
  floor: ProviderFloors,
): Promise<BulkEditOutcome> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', parsed.error.issues.map((issue) => issue.message).join('; '))
  const { ids, patch } = parsed.data
  const { data, error } = await client.rpc('admin_bulk_edit_templates', {
    p_ids: ids,
    p_patch: toSqlPatch(patch),
    p_floor: floor,
    p_actor: adminId,
    // The launched languages, whose own complete cover set also lets a template onto the web (0825).
    p_locales: LOCALES,
  })
  if (error) {
    const known = SQL_ERRORS[error.message]
    if (known) throw new AppError(known[0], known[1])
    throw new AppError('INTERNAL', `bulkEditTemplates failed: ${error.message}`)
  }
  const result = resultSchema.safeParse(data)
  if (!result.success) throw new AppError('INTERNAL', 'admin_bulk_edit_templates returned an unexpected shape')
  const failures: BulkEditFailure[] = result.data.failures
  const changed = failures.length > 0 ? 0 : (result.data.changed ?? 0)
  // One line per template, like the 上架 switch: the audit trail of who changed which price.
  if (changed > 0) for (const id of ids) logger.info('admin.template.bulk_edited', { adminId, templateId: id, patch })
  return { changed, failures }
}
