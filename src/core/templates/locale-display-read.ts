import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import { isLocale } from '../i18n/locales'
import { NO_LOCALE_DISPLAY, type LocaleDisplay } from './locale-display'

type OrderRow = { locale: string; category_key: string; sort_order: number }
type FeaturedRow = { locale: string; template_id: string; rank: number }

// A database that has no such tables yet (a preview before migration 1575): follow the shared
// order. Any other failure throws, so the caller's own failure handling decides.
const MISSING = new Set(['42P01', 'PGRST205'])

type Failure = { code: string; message: string }

// The first failed read of the two, if any.
const failure = (...results: { error: Failure | null }[]) => results.find((result) => result.error)?.error ?? null

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

export async function readLocaleDisplay(db: SupabaseClient): Promise<LocaleDisplay> {
  const [order, featured] = await Promise.all([
    db.from('template_category_locale_order').select('locale,category_key,sort_order').returns<OrderRow[]>(),
    db.from('template_featured_locale').select('locale,template_id,rank').order('rank').returns<FeaturedRow[]>(),
  ])
  const error = failure(order, featured)
  if (error && MISSING.has(error.code)) {
    logger.warn('templates.locale_display_missing', { code: error.code })
    return NO_LOCALE_DISPLAY
  }
  if (error) throw new Error(`locale display read: ${error.message}`)
  return toLocaleDisplay(order.data ?? [], featured.data ?? [])
}
