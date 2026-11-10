import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { Locale } from '../i18n/locales'
import { CATEGORY_COLUMNS } from './categories'
import { coverLocalesSchema, effectiveStillCover } from './cover-locales'
import { localizeTemplate, type LocalizedTemplate } from './localize'
import { buildCategoryTree, cursorSchema, PAGE_SIZE, pathSchema, type CatalogueCursor, type CataloguePage, type TaxonomyRow } from './taxonomy'
import { TEMPLATE_COLUMNS, toTemplate, type TemplateRow } from './types'

const TREE_COLUMNS = CATEGORY_COLUMNS + ',parent_id,slug,level,seo_title_en,seo_title_zh,seo_description_en,seo_description_zh'

export async function readCategoryTree(db: SupabaseClient) {
  const rows: TaxonomyRow[] = []
  for (;;) {
    const query = db.from('template_categories').select(TREE_COLUMNS)
      .eq('kind', 'template').eq('is_system', false).eq('is_visible', true).order('key').limit(250)
    const last = rows.at(-1)
    if (last) query.gt('key', last.key)
    const { data, error } = await query.returns<TaxonomyRow[]>()
    if (error) throw error
    rows.push(...data)
    if (data.length < 250) return buildCategoryTree(rows)
  }
}

type SeriesRow = {
  id: string; slug: string; name_en: string; name_zh: string
  description_en: string | null; description_zh: string | null; cover_url: string | null
}
type EntryRow = { entry_key: string; sort_order: number } & (
  | { type: 'template'; entry_template: TemplateRow }
  | { type: 'series'; entry_series: SeriesRow; entry_cover: Pick<TemplateRow, 'cover_locales' | 'cover_after_url'> }
)
export type CatalogueEntry =
  | { type: 'template'; template: LocalizedTemplate }
  | { type: 'series'; series: { id: string; slug: string; name: string; description: string | null; coverUrl: string | null } }

const ENTRY_COLUMNS = 'type,entry_key,sort_order,entry_series(id,slug,name_en,name_zh,description_en,description_zh,cover_url),' +
  'entry_cover(cover_locales,cover_after_url),entry_template(' + TEMPLATE_COLUMNS + ')'

function toEntry(row: EntryRow, locale: Locale): CatalogueEntry {
  if (row.type === 'template') return { type: 'template', template: localizeTemplate(toTemplate(row.entry_template), locale) }
  const s = row.entry_series
  const cover = row.entry_cover
  return { type: 'series', series: {
    id: s.id, slug: s.slug, name: locale === 'zh' ? s.name_zh : s.name_en,
    description: locale === 'zh' ? s.description_zh : s.description_en,
    coverUrl: s.cover_url ?? effectiveStillCover(coverLocalesSchema.parse(cover.cover_locales), locale, 'after', cover.cover_after_url),
  } }
}

function after(cursor: CatalogueCursor, sort: string, key: string) {
  const { order, key: value } = cursorSchema.parse(cursor)
  return `${sort}.gt.${order},and(${sort}.eq.${order},${key}.gt.${value})`
}

function page<R,T>(rows: R[], item: (row: R) => T, cursor: (row: R) => CatalogueCursor): CataloguePage<T> {
  const items = rows.slice(0, PAGE_SIZE)
  return { items: items.map(item), nextCursor: rows.length > PAGE_SIZE ? cursor(items[PAGE_SIZE - 1]) : null }
}

export async function readCategoryEntries(db: SupabaseClient, path: string[], locale: Locale, cursor?: CatalogueCursor) {
  const query = db.rpc('category_entries', { p_path: pathSchema.parse(path) }).select(ENTRY_COLUMNS)
    .order('sort_order').order('entry_key').limit(PAGE_SIZE + 1)
  if (cursor) query.or(after(cursor, 'sort_order', 'entry_key'))
  const { data, error } = await query.returns<EntryRow[]>()
  if (error) throw error
  return page(data, row => toEntry(row, locale), row => ({ order: row.sort_order, key: row.entry_key }))
}

export async function readSeriesMembers(db: SupabaseClient, id: string, locale: Locale, cursor?: CatalogueCursor) {
  const query = db.rpc('web_templates', { p_series_id: z.uuid().parse(id) }).select(TEMPLATE_COLUMNS + ',series_sort_order')
    .order('series_sort_order').order('id').limit(PAGE_SIZE + 1)
  if (cursor) query.or(after(cursor, 'series_sort_order', 'id'))
  const { data, error } = await query.returns<(TemplateRow & { series_sort_order: number })[]>()
  if (error) throw error
  return page(data, row => localizeTemplate(toTemplate(row), locale), row => ({ order: row.series_sort_order, key: row.id }))
}
