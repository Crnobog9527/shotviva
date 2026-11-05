import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import {
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

export async function templateExists(client: SupabaseClient, id: string): Promise<boolean> {
  const { count, error } = await client
    .from('templates')
    .select('id', { count: 'exact', head: true })
    .eq('id', id)
  if (error) throw new AppError('INTERNAL', `templateExists failed: ${error.message}`)
  return (count ?? 0) > 0
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
  const { data, error } = await client
    .from('templates')
    .update({ is_active: active })
    .eq('id', id)
    .select('id')
  if (error) throw new AppError('INTERNAL', `setTemplateActive failed: ${error.message}`)
  if (data.length === 0) throw new AppError('NOT_FOUND', `template ${id} not found`)
}

export async function reorderTemplates(client: SupabaseClient, ids: string[]): Promise<void> {
  const { error } = await client.rpc('admin_reorder_templates', { p_ids: ids })
  if (error) throw new AppError('INTERNAL', `reorderTemplates failed: ${error.message}`)
}
