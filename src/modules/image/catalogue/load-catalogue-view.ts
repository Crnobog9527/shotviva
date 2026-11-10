import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Locale } from '@/core/i18n/locales'
import { cachedCatalogueIndex, listTemplatesIn } from '@/core/templates'

import { toCatalogueTemplate } from './catalogue-template'
import { buildCatalogueView, type CatalogueView } from './catalogue-view'

// Create's grid (T102): the templates on the visitor's own session, series members included
// (a member opens from its series sheet, Saved and ?favorite= like any template), placed by the
// shared, cached card index.
export async function loadCatalogueView(db: SupabaseClient, locale: Locale): Promise<CatalogueView> {
  const [templates, index] = await Promise.all([listTemplatesIn(db, locale, { includeSeriesMembers: true }), cachedCatalogueIndex(locale)])
  return buildCatalogueView(index, templates.map(toCatalogueTemplate), locale === 'zh')
}
