import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { logger } from '../logger'
import { EDIT_TEMPLATE_ID } from './edit-params'
import { templateFieldsSchema, type TemplateSurface } from './schema'
import { TEMPLATE_COLUMNS, toTemplate, type Template, type TemplateRow } from './types'

export type GenerationTemplate = {
  template: Template
  // Wrapped prompt: server-only, never logged, never returned to a client.
  prompt: { body: string; version: number; modelParams: Record<string, unknown> }
}

type Row = TemplateRow & {
  template_prompts: { body: string; version: number; model_params: Record<string, unknown> } | null
}

// Needs the service-role client: template_prompts has no client grants (T3). The surface
// filter keeps partner-only templates such as `freeform` out of the web generate route; null
// means a built-in template such as `edit`, which is on no surface (ARCHITECTURE §5.2).
async function loadTemplate(client: SupabaseClient, id: string, surface: TemplateSurface | null): Promise<GenerationTemplate> {
  let query = client
    .from('templates')
    .select(`${TEMPLATE_COLUMNS}, template_prompts(body, version, model_params)`)
    .eq('id', id)
    .eq('is_active', true)
  if (surface) query = query.contains('visible_in', [surface])
  const { data, error } = await query.maybeSingle<Row>()
  if (error) throw new AppError('INTERNAL', `loadGenerationTemplate failed: ${error.message}`)
  if (!data) throw new AppError('NOT_FOUND', 'Template not found')

  const fields = templateFieldsSchema.safeParse(data.fields)
  if (!data.template_prompts || !fields.success) {
    logger.error('template is published but cannot generate', { templateId: id, hasPrompt: !!data.template_prompts })
    throw new AppError('NOT_FOUND', 'Template not found')
  }
  const prompt = data.template_prompts
  return {
    template: { ...toTemplate(data), fields: fields.data },
    prompt: { body: prompt.body, version: prompt.version, modelParams: prompt.model_params },
  }
}

export function loadGenerationTemplate(client: SupabaseClient, id: string, surface: TemplateSurface): Promise<GenerationTemplate> {
  return loadTemplate(client, id, surface)
}

// The built-in `edit` template, published or NOT_FOUND (editing is off until the Owner turns it on).
export function loadEditTemplate(client: SupabaseClient): Promise<GenerationTemplate> {
  return loadTemplate(client, EDIT_TEMPLATE_ID, null)
}
