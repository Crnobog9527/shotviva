import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { idsSchema, type BulkTaskOutcome } from './bulk-task-rules'

// 批量删除 and 批量开放 / 停止售卖 (Owner 2026-11-14). Each template goes through the same audited
// function its single control calls (admin_delete_template 1401, admin_set_template_sale 1100),
// one after another, so every rule and audit row is exactly the single path's. A refusal skips
// that template with the function's reason; the others still go through. No new table writes.

type Step = (id: string) => Promise<{ error: { message: string; details?: string; code?: string } | null }>

const DELETE_REASONS: Record<string, string> = {
  TEMPLATE_LIVE: '已上架，先下架才能删除',
  TEMPLATE_BUILT_IN: '系统模板不能删除',
  TEMPLATE_MISSING: '模板已不存在',
}

const SALE_REASONS: Record<string, string> = {
  UNPUBLISH_FIRST: '已上架，先下架才能停止售卖',
  FORBIDDEN: '只有管理员能改售卖状态',
}

async function eachTemplate(ids: string[], step: Step, reasons: Record<string, string>, what: string): Promise<BulkTaskOutcome> {
  const outcome: BulkTaskOutcome = { done: [], skipped: [] }
  for (const id of ids) {
    const { error } = await step(id)
    if (!error) {
      outcome.done.push(id)
      continue
    }
    if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', '只有管理员能批量操作模板')
    // P0002: the row went away between the page load and this call (select … into strict).
    const reason = reasons[error.message] ?? (error.code === 'P0002' ? '模板已不存在' : null) ?? (error.details && /[一-鿿]/.test(error.details) ? error.details : null)
    if (!reason) throw new AppError('INTERNAL', `${what} failed`, { cause: error })
    outcome.skipped.push({ id, reason })
  }
  return outcome
}

export async function deleteTemplates(client: SupabaseClient, adminId: string, input: unknown): Promise<BulkTaskOutcome> {
  const parsed = z.object({ ids: idsSchema }).safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '批量删除的参数不对，请刷新页面后再试')
  const outcome = await eachTemplate(parsed.data.ids,
    async id => client.rpc('admin_delete_template', { p_actor: adminId, p_id: id }), DELETE_REASONS, 'admin_delete_template')
  for (const id of outcome.done) logger.info('admin.template.deleted', { adminId, templateId: id, bulk: true })
  return outcome
}

export async function setTemplatesSale(client: SupabaseClient, adminId: string, input: unknown): Promise<BulkTaskOutcome> {
  const parsed = z.object({ ids: idsSchema, enabled: z.boolean() }).safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '批量售卖的参数不对，请刷新页面后再试')
  const { ids, enabled } = parsed.data
  const outcome = await eachTemplate(ids,
    async id => client.rpc('admin_set_template_sale', { p_actor: adminId, p_template_id: id, p_enabled: enabled }), SALE_REASONS, 'admin_set_template_sale')
  for (const id of outcome.done) logger.info('admin.template.sale_changed', { adminId, templateId: id, enabled, bulk: true })
  return outcome
}
