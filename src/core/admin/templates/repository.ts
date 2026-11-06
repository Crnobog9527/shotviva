import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import {
  EDIT_TEMPLATE_ID,
  TEMPLATE_COLUMNS,
  toTemplate,
  type PromptInput,
  type TemplateInput,
  type TemplateRow,
} from '@/core/templates'

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

export async function setTemplateActive(
  client: SupabaseClient,
  id: string,
  active: boolean,
): Promise<void> {
  // An unpublished template cannot stay featured (T53, templates_featured_live_check).
  const { data, error } = await client
    .from('templates')
    .update(active ? { is_active: true } : { is_active: false, featured_rank: null })
    .eq('id', id)
    .select('id')
  if (error) throw new AppError('INTERNAL', `setTemplateActive failed: ${error.message}`)
  if (data.length === 0) throw new AppError('NOT_FOUND', `template ${id} not found`)
}

// The home featured list in display order (T53); the SQL function checks the rules.
export async function setFeaturedTemplates(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client.rpc('admin_set_featured_templates', { p_ids: ids })
  if (error) {
    if (error.code === '22023') throw new AppError('INVALID_INPUT', error.message)
    throw new AppError('INTERNAL', `setFeaturedTemplates failed: ${error.message}`)
  }
}

export async function reorderTemplates(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client.rpc('admin_reorder_templates', { p_ids: ids })
  if (error) throw new AppError('INTERNAL', `reorderTemplates failed: ${error.message}`)
}
