import 'server-only'

import type { Locale } from '@/core/i18n/locales'
import { cachedCatalogueIndex, cachedPosterTemplates, cachedWebTemplates } from '@/core/templates'

import { toCatalogueTemplate } from './catalogue-template'
import { buildCatalogueView, type CatalogueView } from './catalogue-view'

// Create's grid (T102): the live templates, series members included (a member opens from its
// series sheet, Saved and ?favorite= like any template), placed by the card index. Both come
// from the cache the templates tag expires, not from a database read per visit.
// posters: whether this account may use the dense-text poster editor (feature dense_poster,
// ARCHITECTURE §5.3); when it may, the poster templates join their 海报 category and their cards
// open the editor. They stay out of batch create, the home page and the marketing pages.
export async function loadCatalogueView(locale: Locale, posters: boolean | Promise<boolean> = false): Promise<CatalogueView> {
  const [templates, index, posterTemplates] = await Promise.all([
    cachedWebTemplates(locale, true), cachedCatalogueIndex(locale),
    Promise.resolve(posters).then((allowed) => (allowed ? cachedPosterTemplates(locale) : [])),
  ])
  return buildCatalogueView(index, [...templates, ...posterTemplates].map(toCatalogueTemplate), locale === 'zh')
}
