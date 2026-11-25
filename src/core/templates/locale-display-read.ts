import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import { isLocale } from '../i18n/locales'
import { NO_LOCALE_DISPLAY, type FeaturedBundles, type LocaleDisplay } from './locale-display'

type OrderRow = { locale: string; category_key: string; sort_order: number }
type FeaturedRow = { locale: string; template_id: string; rank: number }
type BundleRow = { id: string; name_en: string; name_zh: string; featured_rank: number | null }
type ItemRow = { bundle_id: string; template_id: string; position: number }
type BundlePlaceRow = { locale: string; bundle_id: string; rank: number }

// A database that has no such tables yet (a preview before migration 1575): follow the shared
// order. Any other failure throws, so the caller's own failure handling decides.
const MISSING = new Set(['42P01', 'PGRST205'])

type Failure = { code: string; message: string }
type Page<T> = { data: T[] | null; error: Failure | null }

// PostgREST caps a response (max_rows), so read in ranges, in a fixed order, until a short page.
const PAGE = 500
async function readAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<Page<T>> {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1)
    if (error || !data) return { data: null, error: error ?? { code: '', message: 'no data' } }
    rows.push(...data)
    if (data.length < PAGE) return { data: rows, error: null }
  }
}

// The first failed read of the two, if any.
const failure = (...results: Page<unknown>[]) => results.find((result) => result.error)?.error ?? null

export function toLocaleDisplay(order: readonly OrderRow[], featured: readonly FeaturedRow[]): LocaleDisplay {
  const display: LocaleDisplay = { categoryOrder: {}, featured: {} }
  for (const row of order) {
    if (isLocale(row.locale)) (display.categoryOrder[row.locale] ??= {})[row.category_key] = row.sort_order
  }
  for (const row of featured) {
    if (isLocale(row.locale)) (display.featured[row.locale] ??= []).push(row.template_id)
  }
  return display
}

export function toFeaturedBundles(bundles: readonly BundleRow[], items: readonly ItemRow[], places: readonly BundlePlaceRow[]): FeaturedBundles {
  const members = new Map<string, ItemRow[]>()
  for (const item of items) members.set(item.bundle_id, [...(members.get(item.bundle_id) ?? []), item])
  const locale: FeaturedBundles['locale'] = {}
  for (const row of [...places].sort((a, b) => a.rank - b.rank)) {
    if (isLocale(row.locale)) (locale[row.locale] ??= []).push(row.bundle_id)
  }
  return {
    list: bundles.map((row) => ({
      id: row.id, nameEn: row.name_en, nameZh: row.name_zh, featuredRank: row.featured_rank,
      templateIds: (members.get(row.id) ?? []).sort((a, b) => a.position - b.position).map((item) => item.template_id),
    })),
    locale,
  }
}

// 精选组合 (migrations 2004, 2005), read apart from the catalogue's display rules so the
// catalogue never waits on them or fails with them: a database without the tables or any failed
// read gives undefined (no bundles shown), logged.
export async function readFeaturedBundles(db: SupabaseClient): Promise<FeaturedBundles | undefined> {
  try {
    return await readBundleTables(db)
  } catch (error) {
    logger.warn('templates.bundles_read_failed', { error })
    return undefined
  }
}

async function readBundleTables(db: SupabaseClient): Promise<FeaturedBundles | undefined> {
  const [bundles, items, places] = await Promise.all([
    readAll<BundleRow>((from, to) => db.from('featured_bundles').select('id,name_en,name_zh,featured_rank')
      .order('created_at').order('id').range(from, to).returns<BundleRow[]>()),
    readAll<ItemRow>((from, to) => db.from('featured_bundle_items').select('bundle_id,template_id,position')
      .order('bundle_id').order('position').range(from, to).returns<ItemRow[]>()),
    readAll<BundlePlaceRow>((from, to) => db.from('bundle_featured_locale').select('locale,bundle_id,rank')
      .order('locale').order('rank').range(from, to).returns<BundlePlaceRow[]>()),
  ])
  const error = failure(bundles, items, places)
  if (error && MISSING.has(error.code)) return undefined
  if (error) throw new Error(`featured bundles read: ${error.message}`)
  return toFeaturedBundles(bundles.data ?? [], items.data ?? [], places.data ?? [])
}

export async function readLocaleDisplay(db: SupabaseClient): Promise<LocaleDisplay> {
  const [order, featured] = await Promise.all([
    readAll<OrderRow>((from, to) => db.from('template_category_locale_order').select('locale,category_key,sort_order')
      .order('locale').order('category_key').range(from, to).returns<OrderRow[]>()),
    readAll<FeaturedRow>((from, to) => db.from('template_featured_locale').select('locale,template_id,rank')
      .order('locale').order('rank').range(from, to).returns<FeaturedRow[]>()),
  ])
  const error = failure(order, featured)
  if (error && MISSING.has(error.code)) {
    logger.warn('templates.locale_display_missing', { code: error.code })
    return NO_LOCALE_DISPLAY
  }
  if (error) throw new Error(`locale display read: ${error.message}`)
  return toLocaleDisplay(order.data ?? [], featured.data ?? [])
}
