import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

// A template link the live catalogue no longer answers: is it a template that is published
// (active, on the web, not deleted, its series and category shown) but held back from sale (the
// price-floor gate, admin.web_standard_sale_allowed)? Then its workspace says "temporarily
// unavailable" and points to its category (Owner 2026-11-14); anything else stays a 404. Says
// nothing about why: no price, no cost. Service role, primary-key reads only.
export type OffSaleTemplate = { categoryPath: string[] }

export type Row = {
  is_active: boolean
  visible_in: string[]
  deleted_at: string | null
  category_key: string
  subcategory_key: string | null
  template_series: { is_active: boolean; deleted_at: string | null; category_key: string } | null
}

type CategoryRow = { key: string; path: string[]; web_visible: boolean }

async function categoryRows(db: SupabaseClient, keys: string[]): Promise<CategoryRow[]> {
  const { data, error } = await db.from('template_category_paths').select('key, path, web_visible').in('key', keys).returns<CategoryRow[]>()
  if (error) throw new Error(`category paths read failed: ${error.message}`)
  return data
}

// The categories a published template needs shown (its own, and its series' when it has one);
// null when the row itself is not published on the web.
export function publishedCategories(row: Row | null): string[] | null {
  if (!row || !row.is_active || row.deleted_at || !row.visible_in.includes('web')) return null
  const series = row.template_series
  if (series && (!series.is_active || series.deleted_at)) return null
  const own = row.subcategory_key ?? row.category_key
  return series ? [own, series.category_key] : [own]
}

export async function findOffSaleTemplate(db: SupabaseClient, id: string): Promise<OffSaleTemplate | null> {
  const { data, error } = await db
    .from('templates')
    .select('is_active, visible_in, deleted_at, category_key, subcategory_key, template_series(is_active, deleted_at, category_key)')
    .eq('id', id)
    .maybeSingle<Row>()
  if (error) throw new Error(`template read failed: ${error.message}`)
  const keys = publishedCategories(data)
  if (!keys) return null
  const rows = await categoryRows(db, keys)
  if (!keys.every((key) => rows.some((row) => row.key === key && row.web_visible))) return null
  const own = rows.find((row) => row.key === keys[0])
  return own ? { categoryPath: own.path } : null
}
