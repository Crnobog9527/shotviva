import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Locale } from '../i18n/locales'
import type { CategoryNode } from './taxonomy'
import { catalogueEntries, type CatalogueMember, type CatalogueSeriesRow } from './catalogue-index-entries'
import { readCategoryTree } from './taxonomy-reads'

// Create's whole catalogue in one light read (T102): which cards the grid shows, in the order
// category_entries gives them (sort_order, entry_key), each with the category it sits in, plus
// every visible series and its members in series order. Template data itself comes from the
// page's own template read; this only says where each card goes, so the browser can filter by
// any category path at once without another round trip.
export type IndexEntry = { type: 'template' | 'series'; id: string; categoryKey: string }
export type IndexSeries = {
  id: string
  slug: string
  name: string
  description: string | null
  // The series' own cover; null falls back to a member's cover in the card.
  coverUrl: string | null
  memberIds: string[]
}
export type CatalogueIndex = { tree: CategoryNode[]; entries: IndexEntry[]; series: IndexSeries[] }

export type SeriesRow = {
  id: string; slug: string; name_en: string; name_zh: string
  description_en: string | null; description_zh: string | null; cover_url: string | null
}
export type EntryRow = {
  type: 'template' | 'series'; entry_key: string; sort_order: number; category_key: string
  template_id: string | null; series_id: string | null; entry_series: SeriesRow | null
}
type MemberRow = { id: string; series_id: string; series_sort_order: number }
const BATCH = 500

// PostgREST caps a response; read in ranges until a short page.
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + BATCH - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < BATCH) return rows
  }
}

export function toCatalogueIndex(tree: CategoryNode[], entryRows: EntryRow[], memberRows: MemberRow[], locale: Locale): CatalogueIndex {
  const members = new Map<string, MemberRow[]>()
  for (const row of memberRows) members.set(row.series_id, [...(members.get(row.series_id) ?? []), row])
  const entries: IndexEntry[] = []
  const series: IndexSeries[] = []
  for (const row of entryRows) {
    const id = row.type === 'template' ? row.template_id : row.series_id
    if (!id) continue
    entries.push({ type: row.type, id, categoryKey: row.category_key })
    if (row.type === 'series' && row.entry_series) series.push(toSeries(row.entry_series, members.get(id) ?? [], locale))
  }
  return { tree, entries, series }
}

function toSeries(row: SeriesRow, members: MemberRow[], locale: Locale): IndexSeries {
  const zh = locale === 'zh'
  const ordered = [...members].sort((a, b) => a.series_sort_order - b.series_sort_order || a.id.localeCompare(b.id))
  return {
    id: row.id, slug: row.slug, name: zh ? row.name_zh : row.name_en, description: zh ? row.description_zh : row.description_en,
    coverUrl: row.cover_url, memberIds: ordered.map((member) => member.id),
  }
}

export async function readCatalogueIndex(db: SupabaseClient, locale: Locale): Promise<CatalogueIndex> {
  const [tree, members, series, categories] = await Promise.all([
    readCategoryTree(db),
    readAll<CatalogueMember>((from, to) => db.from('web_template_members')
      .select('id,series_id,series_sort_order,sort_order,category_key,standalone')
      .order('id').range(from, to).returns<CatalogueMember[]>()),
    readAll<CatalogueSeriesRow>((from, to) => db.from('template_series')
      .select('id,slug,name_en,name_zh,description_en,description_zh,cover_url,category_key,sort_order')
      .eq('is_active', true).order('id').range(from, to).returns<CatalogueSeriesRow[]>()),
    readAll<{ key: string }>((from, to) => db.from('template_category_paths').select('key')
      .eq('web_visible', true).order('key').range(from, to).returns<{ key: string }[]>()),
  ])
  const entryRows = catalogueEntries(members, series, new Set(categories.map((category) => category.key)))
  const memberRows = members.filter((member): member is CatalogueMember & { series_id: string } => member.series_id !== null)
  return toCatalogueIndex(tree, entryRows, memberRows, locale)
}
