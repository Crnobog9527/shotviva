import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError, type ErrorCode } from '@/core/errors'
import {
  EDIT_TEMPLATE_ID,
  TEMPLATE_COLUMNS,
  toTemplate,
  type PromptInput,
  type TemplateInput,
  type TemplateRow,
} from '@/core/templates'

import type { PublishCandidate } from './publish-rules'
import { toUpsertArgs } from './rpc-payload'
import type { AdminTemplate } from './types'

// Every function expects a service-role client; callers must have passed requireAdmin().

type PromptRow = { body: string; version: number; model_params: Record<string, unknown> }
type AdminRow = TemplateRow & { template_prompts: PromptRow | null }

export async function listAdminTemplates(client: SupabaseClient): Promise<AdminTemplate[]> {
  const { data, error } = await client
    .from('templates')
    .select(`${TEMPLATE_COLUMNS}, template_prompts(body, version, model_params)`)
    // The built-in edit template has its own page (/admin/templates/edit): this editor's form
    // would refuse its empty visible_in, and its params are not free-form JSON.
    .neq('id', EDIT_TEMPLATE_ID)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .returns<AdminRow[]>()
  if (error) throw new AppError('INTERNAL', `listAdminTemplates failed: ${error.message}`)
  return data.map((row) => ({
    ...toTemplate(row),
    prompt: row.template_prompts
      ? {
          body: row.template_prompts.body,
          version: row.template_prompts.version,
          modelParams: row.template_prompts.model_params,
        }
      : null,
  }))
}

// A plain GET, not `head: true`: PostgREST answers HEAD without Content-Length and then
// closes the connection, and Kong reuses that dead connection for the next request. The
// POST that follows here (admin_upsert_template) then fails with a 502 (see eslint config).
export async function templateExists(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from('templates').select('id').eq('id', id).limit(1)
  if (error) throw new AppError('INTERNAL', `templateExists failed: ${error.message}`)
  return data.length > 0
}

export async function upsertTemplate(
  client: SupabaseClient,
  template: TemplateInput,
  prompt: PromptInput,
): Promise<void> {
  const { error } = await client.rpc('admin_upsert_template', toUpsertArgs(template, prompt))
  if (error) throw new AppError('INTERNAL', `upsertTemplate failed: ${error.message}`)
}

type CandidateRow = Pick<
  TemplateRow,
  'id' | 'name' | 'description' | 'visible_in' | 'cover_before_url' | 'cover_after_url' | 'quality' | 'credits_cost' | 'is_active'
> & { template_prompts: { version: number } | null }

// Only what the publish rules read (T60); one query for the whole batch, by primary key.
export async function loadPublishCandidates(client: SupabaseClient, ids: readonly string[]): Promise<PublishCandidate[]> {
  const { data, error } = await client
    .from('templates')
    .select('id, name, description, visible_in, cover_before_url, cover_after_url, quality, credits_cost, is_active, template_prompts(version)')
    .in('id', ids)
    .returns<CandidateRow[]>()
  if (error) throw new AppError('INTERNAL', `loadPublishCandidates failed: ${error.message}`)
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    visibleIn: row.visible_in,
    coverBeforeUrl: row.cover_before_url,
    coverAfterUrl: row.cover_after_url,
    quality: row.quality,
    creditsCost: row.credits_cost,
    isActive: row.is_active,
    hasPrompt: row.template_prompts !== null,
  }))
}

// One update for the batch (primary-key filter).
export async function setTemplatesActive(client: SupabaseClient, ids: readonly string[], active: boolean): Promise<void> {
  // An unpublished template cannot stay featured (T53, templates_featured_live_check).
  const { error } = await client
    .from('templates')
    .update(active ? { is_active: true } : { is_active: false, featured_rank: null })
    .in('id', ids)
  if (error) throw new AppError('INTERNAL', `setTemplatesActive failed: ${error.message}`)
}

// The home featured list in display order (T53); the SQL function checks the rules.
export async function setFeaturedTemplates(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client.rpc('admin_set_featured_templates', { p_ids: ids })
  if (error) {
    if (error.code === '22023') throw new AppError('INVALID_INPUT', error.message)
    throw new AppError('INTERNAL', `setFeaturedTemplates failed: ${error.message}`)
  }
}

// What the admin sees when admin_set_template_order refuses (0600); anything else is INTERNAL.
const ORDER_ERRORS: Record<string, [ErrorCode, string]> = {
  ORDER_MISMATCH: ['CONFLICT', '列表在别处改过了（有模板新增、删除或进出精选），请刷新页面后再排序'],
  NOT_ADMIN: ['FORBIDDEN', '只有管理员能调整顺序'],
  INVALID_INPUT: ['INVALID_INPUT', '顺序没保存：提交的列表不完整，请刷新页面后再试'],
}

// One group's whole order in one call (T76): 'catalogue' rewrites sort_order, 'featured' the
// home featured ranks.
export async function setTemplateOrder(
  client: SupabaseClient,
  group: 'catalogue' | 'featured',
  ids: string[],
  actor: string,
): Promise<void> {
  const { error } = await client.rpc('admin_set_template_order', { p_group: group, p_ids: ids, p_actor: actor })
  if (!error) return
  const known = ORDER_ERRORS[error.message]
  if (known) throw new AppError(known[0], known[1])
  throw new AppError('INTERNAL', `setTemplateOrder failed: ${error.message}`)
}
