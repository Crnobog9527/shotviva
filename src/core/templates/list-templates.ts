import type { SupabaseClient } from '@supabase/supabase-js'

import type { TemplateSurface } from './schema'
import { TEMPLATE_COLUMNS, toTemplate, type Template, type TemplateRow } from './types'

// Catalogue for one entry point. Pass a public (anon) client so RLS limits rows to published
// templates; the surface filter is what keeps partner-only rows such as `freeform` off the web.
export async function listTemplates(
  client: SupabaseClient,
  surface: TemplateSurface,
): Promise<Template[]> {
  const { data, error } = await client
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('is_active', true)
    .contains('visible_in', [surface])
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .returns<TemplateRow[]>()
  if (error) throw new Error(`listTemplates failed: ${error.message}`)
  return data.map(toTemplate)
}
