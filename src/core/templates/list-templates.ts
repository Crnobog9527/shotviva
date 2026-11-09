import type { SupabaseClient } from '@supabase/supabase-js'

import type { Locale } from '../i18n/locales'
import { localizeTemplate, type LocalizedTemplate } from './localize'
import type { TemplateSurface } from './schema'
import { selectTemplates } from './select-templates'
import { toTemplate, type PreT75TemplateRow, type Template, type TemplateRow } from './types'

// Catalogue for one entry point. Pass a public (anon) client so RLS limits rows to published
// templates; the surface filter is what keeps partner-only rows such as `freeform` off the web.
type CatalogueRow = (TemplateRow | PreT75TemplateRow) & { partner_image_aspects?: string[] }

export async function listTemplates(
  client: SupabaseClient,
  surface: TemplateSurface,
): Promise<Template[]> {
  const { data, error } = await selectTemplates((columns) =>
    client
      .from('templates')
      .select(columns)
      .eq('is_active', true)
      .contains('visible_in', [surface])
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .returns<CatalogueRow[]>(),
    surface === 'partner' ? ', partner_image_aspects' : '',
  )
  if (error || !data) throw new Error(`listTemplates failed: ${error?.message ?? 'no data'}`)
  return data.flatMap((row) => {
    const template = toTemplate(row)
    if (surface !== 'partner') return [template]
    const aspects = row.partner_image_aspects ?? template.fields.aspectRatios
    return aspects.length ? [{ ...template, fields: { ...template.fields, aspectRatios: aspects } }] : []
  })
}

// The web catalogue in the page's language (names and copy labels from templates.translations,
// English where a translation is missing). Templates in a system category (photo edit, partner
// freeform) never show on the site, even if made web-visible (T75). The partner API keeps
// listTemplates: its contract is English, and its freeform template is in a system category.
export async function listTemplatesIn(client: SupabaseClient, locale: Locale): Promise<LocalizedTemplate[]> {
  return (await listTemplates(client, 'web'))
    .filter((template) => !template.categoryInfo.isSystem)
    .map((template) => localizeTemplate(template, locale))
}
