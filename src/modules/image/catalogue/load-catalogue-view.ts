import 'server-only'

import type { Locale } from '@/core/i18n/locales'
import { loadCreateCatalogue } from '@/core/templates'

import { toCatalogueTemplate } from './catalogue-template'
import { catalogueForm, toCataloguePayload, type CatalogueForms } from './catalogue-payload'
import { buildCatalogueView, type CatalogueView } from './catalogue-view'

// Create's grid (T102): the live templates, series members included (a member opens from its
// series sheet, Saved and ?favorite= like any template), placed by the card index. Both come
// from the cache the templates tag expires, not from a database read per visit.
// posters: whether this account may use the dense-text poster editor (feature dense_poster,
// ARCHITECTURE §5.3); when it may, the poster templates join their 海报 category and their cards
// open the editor. They stay out of batch create, the home page and the marketing pages.
export async function loadCatalogueView(locale: Locale, posters: boolean | Promise<boolean> = false): Promise<CatalogueView> {
  const { index, templates } = await loadCreateCatalogue(locale, posters)
  return buildCatalogueView(index, templates.map(toCatalogueTemplate), locale === 'zh')
}

export async function loadCataloguePayload(locale: Locale, posters: Promise<boolean>) {
  return toCataloguePayload(await loadCatalogueView(locale, posters))
}

export async function loadCatalogueForms(locale: Locale, ids: readonly string[]): Promise<CatalogueForms> {
  const wanted = new Set(ids)
  const { templates } = await loadCreateCatalogue(locale, false)
  return Object.fromEntries(templates.filter(({ id }) => wanted.has(id))
    .map((template) => [template.id, catalogueForm(toCatalogueTemplate(template))]))
}
