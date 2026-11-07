import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { creditsBelowFloor, EDIT_TEMPLATE_ID, type CreditsFloor, type TemplateRow } from '@/core/templates'

import { saveEditTemplateSchema, type EditTemplateSettings } from './schema'

// /admin/templates/edit (ARCHITECTURE §5.2): the built-in template every photo edit runs on.
// Service-role client only, after requireAdmin().

type Row = Pick<TemplateRow, 'is_active' | 'credits_cost' | 'quality' | 'category'> & {
  template_prompts: { body: string; version: number; model_params: Record<string, unknown> } | null
}

async function loadEditRow(db: SupabaseClient): Promise<Row & { template_prompts: NonNullable<Row['template_prompts']> }> {
  const { data, error } = await db
    .from('templates')
    .select('is_active, credits_cost, quality, category, template_prompts(body, version, model_params)')
    .eq('id', EDIT_TEMPLATE_ID)
    .maybeSingle<Row>()
  if (error) throw new AppError('INTERNAL', `loadEditTemplateSettings failed: ${error.message}`)
  // Seeded by migration 0264; missing only if someone deleted it by hand.
  if (!data?.template_prompts) throw new AppError('NOT_FOUND', 'edit template not found')
  return { ...data, template_prompts: data.template_prompts }
}

export async function loadEditTemplateSettings(db: SupabaseClient): Promise<EditTemplateSettings> {
  const data = await loadEditRow(db)
  return {
    isActive: data.is_active,
    creditsCost: data.credits_cost,
    quality: data.quality,
    wrapper: data.template_prompts.body,
    version: data.template_prompts.version,
    params: data.template_prompts.model_params,
  }
}

// Fixed parts of the row: in no catalogue (visible_in empty), one photo, no copy fields.
const FIXED = {
  id: EDIT_TEMPLATE_ID,
  module: 'image',
  name: 'Edit',
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  visible_in: [],
  sort_order: 0,
}

export async function saveEditTemplate(db: SupabaseClient, adminId: string, input: unknown, floor: CreditsFloor): Promise<void> {
  const parsed = saveEditTemplateSchema.safeParse(input)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.path.join('.') || 'input').join('、')
    throw new AppError('INVALID_INPUT', `这些字段没填或不合法：${detail}`)
  }
  const { isActive, creditsCost, wrapper, params } = parsed.data
  // The category is kept as it is: the Owner may have moved the template when deleting its
  // category in 分类管理 (T75), and 'edit' may no longer exist.
  const { quality, category } = await loadEditRow(db)
  const low = creditsBelowFloor(quality, creditsCost, floor)
  if (low.length > 0) throw new AppError('INVALID_INPUT', `积分低于下限：${low.map((v) => `${v.resolution} 不能低于 ${v.floor}`).join('；')}`)
  const { error } = await db.rpc('admin_upsert_template', {
    p_template: { ...FIXED, category, quality, credits_cost: creditsCost, is_active: isActive },
    p_prompt: { body: wrapper, model_params: params },
  })
  if (error) throw new AppError('INTERNAL', `saveEditTemplate failed: ${error.message}`)
  // Texts are core prompts: log that they changed, never what they say.
  logger.info('admin.edit_template.saved', { adminId, isActive })
}

