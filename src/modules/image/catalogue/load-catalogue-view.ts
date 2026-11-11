import 'server-only'

import type { Locale } from '@/core/i18n/locales'
import { cachedCatalogueIndex, cachedWebTemplates } from '@/core/templates'

import { toCatalogueTemplate } from './catalogue-template'
import { buildCatalogueView, type CatalogueView } from './catalogue-view'

// Create's grid (T102): the live templates, series members included (a member opens from its
// series sheet, Saved and ?favorite= like any template), placed by the card index. Both come
// from the cache the templates tag expires, not from a database read per visit.
export async function loadCatalogueView(locale: Locale): Promise<CatalogueView> {
  const [templates, index] = await Promise.all([cachedWebTemplates(locale, true), cachedCatalogueIndex(locale)])
  return buildCatalogueView(index, templates.map(toCatalogueTemplate), locale === 'zh')
}
