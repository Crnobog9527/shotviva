import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { logger } from '../logger'
import { EDIT_TEMPLATE_ID } from './edit-params'
import { templateFieldsSchema, type TemplateSurface } from './schema'
import { selectTemplates } from './select-templates'
import { toTemplate, type PreT75TemplateRow, type Template, type TemplateRow } from './types'

export type GenerationTemplate = {
  template: Template
  // Wrapped prompt: server-only, never logged, never returned to a client.
  prompt: { body: string; version: number; providerId: string | null; modelParams: Record<string, unknown> }
}

type Row = (TemplateRow | PreT75TemplateRow) & {
  template_prompts: { body: string; version: number; provider_id: string | null; model_params: Record<string, unknown> } | null
}

// Needs the service-role client: template_prompts has no client grants (T3). The surface
// filter keeps partner-only templates such as `freeform` out of the web generate route; null
// means a built-in template such as `edit`, which is on no surface (ARCHITECTURE §5.2).
// `drafts`: an admin test run (ARCHITECTURE §10.b, T85) also takes unpublished templates.
async function loadTemplate(client: SupabaseClient, id: string, surface: TemplateSurface | null, drafts = false): Promise<GenerationTemplate> {
  const { data, error } = await selectTemplates((columns) => {
    const all = client.from('templates').select(columns).eq('id', id)
    const query = drafts ? all : all.eq('is_active', true)
    return (surface ? query.contains('visible_in', [surface]) : query).maybeSingle<Row>()
  }, ', template_prompts(body, version, model_params, provider_id)')
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
    prompt: { body: prompt.body, version: prompt.version, providerId: prompt.provider_id, modelParams: prompt.model_params },
  }
}

export function loadGenerationTemplate(client: SupabaseClient, id: string, surface: TemplateSurface): Promise<GenerationTemplate> {
  return loadTemplate(client, id, surface)
}

// The built-in `edit` template, published or NOT_FOUND (editing is off until the Owner turns it on).
export function loadEditTemplate(client: SupabaseClient): Promise<GenerationTemplate> {
  return loadTemplate(client, EDIT_TEMPLATE_ID, null)
}

// An admin test run (§10.b, T85): any template but the built-in edit one, published or not, on
// whatever surface; the same prompt and fields a user's generation reads.
// allowEdit: the cover translation (T87) runs on the edit template's own parameters.
export function loadTestTemplate(client: SupabaseClient, id: string, options: { allowEdit?: boolean } = {}): Promise<GenerationTemplate> {
  if (id === EDIT_TEMPLATE_ID && !options.allowEdit) throw new AppError('NOT_FOUND', 'Template not found')
  return loadTemplate(client, id, null, true)
}
