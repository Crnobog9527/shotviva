import type { SupabaseClient } from '@supabase/supabase-js'

import type { Locale } from '../i18n/locales'
import { localizeTemplate, type LocalizedTemplate } from './localize'
import type { TemplateSurface } from './schema'
import { selectTemplates } from './select-templates'
import { TEMPLATE_COLUMNS, toTemplate, type PreT75TemplateRow, type Template, type TemplateRow } from './types'

type CatalogueRow = (TemplateRow | PreT75TemplateRow) & {
  partner_image_aspects?: string[]
  category_path?: string[]
  template_series?: { id: string; slug: string; name_en: string; is_active: boolean } | null
}
const CATALOGUE_PAGE_SIZE = 500

function partnerRow(row: CatalogueRow): Template[] {
  const template = toTemplate(row)
  const aspects = row.partner_image_aspects ?? template.fields.aspectRatios
  if (!aspects.length) return []
  const series = row.template_series
  return [{
    ...template, fields: { ...template.fields, aspectRatios: aspects },
    categoryPath: row.category_path ?? [template.category],
    series: series?.is_active ? { id: series.id, slug: series.slug, name: series.name_en } : null,
  }]
}

function legacyList(db: SupabaseClient, surface: TemplateSurface, id: string | undefined, after: string | null) {
  return selectTemplates<CatalogueRow[]>(columns => {
    const query = db.from('templates').select(columns).eq('is_active', true).contains('visible_in', [surface])
    if (id) query.eq('id', id)
    if (after) query.gt('id', after)
    return query.order('id').limit(CATALOGUE_PAGE_SIZE).returns<CatalogueRow[]>()
  }, surface === 'partner' ? ',partner_image_aspects' : '')
}

// posters: the dense-text poster templates only (their own entry, ARCHITECTURE §5.3); without it
// they stay out of the catalogue, the home page and batches. A lookup by id finds either kind.
type WebLookup = { id?: string; includeSeriesMembers?: boolean; posters?: boolean }

async function cataloguePage(db: SupabaseClient, surface: TemplateSurface, lookup: WebLookup, after: string | null) {
  if (surface === 'web') {
    const query = db.rpc('web_templates', { p_template_id: lookup.id ?? null, p_include_members: lookup.includeSeriesMembers ?? false }).select(TEMPLATE_COLUMNS)
    if (after) query.gt('id', after)
    const result = await query.order('id').limit(CATALOGUE_PAGE_SIZE).returns<CatalogueRow[]>()
    if (result.error?.code !== 'PGRST202') return result
  } else {
    const query = db.from('templates').select(TEMPLATE_COLUMNS + ',partner_image_aspects,category_path,template_series(id,slug,name_en,is_active)')
      .eq('is_active', true).contains('visible_in', [surface])
    if (after) query.gt('id', after)
    const result = await query.order('id').limit(CATALOGUE_PAGE_SIZE).returns<CatalogueRow[]>()
    if (!result.error || !['PGRST200', '42703'].includes(result.error.code)) return result
  }
  // Deployment restored onto the pre-taxonomy schema.
  return legacyList(db, surface, lookup.id, after)
}

export async function listTemplates(db: SupabaseClient, surface: TemplateSurface, lookup: WebLookup = {}): Promise<Template[]> {
  const rows: CatalogueRow[] = []
  let after: string | null = null
  for (;;) {
    const { data, error } = await cataloguePage(db, surface, lookup, after)
    if (error || !Array.isArray(data)) throw new Error(`listTemplates failed: ${error?.message ?? 'no data'}`)
    rows.push(...data)
    if (data.length < CATALOGUE_PAGE_SIZE) break
    after = data[data.length - 1].id
  }
  // An in-flight reorder cannot move a row across the id cursor. Keep id order for tied ranks.
  rows.sort((a, b) => a.sort_order - b.sort_order)
  return surface === 'partner' ? rows.flatMap(partnerRow) : rows.map(toTemplate)
}

// Passing an id opens a visible series member in the workspace even when its series hides individual cards.
export async function listTemplatesIn(db: SupabaseClient, locale: Locale, lookup: WebLookup = {}): Promise<LocalizedTemplate[]> {
  return (await listTemplates(db, 'web', lookup))
    .filter(template => !template.categoryInfo.isSystem && (lookup.id !== undefined || Boolean(template.fields.poster) === Boolean(lookup.posters)))
    .map(template => localizeTemplate(template, locale))
}
