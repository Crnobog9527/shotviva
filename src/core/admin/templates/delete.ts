import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

// 删除 in the template list (Owner 2026-11-13): unpublished, non-built-in templates only. A soft
// delete (admin_delete_template, 1401): works, jobs and requests keep pointing at the row, so
// nothing a user made disappears; the template just leaves the admin and can never go live again.
const MESSAGES: Record<string, string> = {
  TEMPLATE_LIVE: '已上架的模板不能删除，请先下架。',
  TEMPLATE_BUILT_IN: '系统模板不能删除。',
  TEMPLATE_MISSING: '这个模板已经不存在，请刷新页面。',
  NOT_ADMIN: '只有管理员可以删除模板。',
}

export async function deleteTemplate(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '删除请求的参数不对。')
  const { id } = parsed.data
  const { data, error } = await client.rpc('admin_delete_template', { p_actor: adminId, p_id: id })
  if (error) {
    const message = MESSAGES[error.message]
    if (message) throw new AppError(error.message === 'NOT_ADMIN' ? 'FORBIDDEN' : 'INVALID_INPUT', message)
    throw new AppError('INTERNAL', 'admin_delete_template failed', { cause: error })
  }
  logger.info('admin.template.deleted', { adminId, templateId: id, changed: data === true })
}
