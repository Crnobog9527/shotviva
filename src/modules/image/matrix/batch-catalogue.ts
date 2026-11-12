import 'server-only'

import type { Locale } from '@/core/i18n/locales'
import { cachedWebTemplates, type LocalizedTemplate } from '@/core/templates'

import { toCatalogueTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { MATRIX_MAX_TEMPLATES } from './matrix-state'

type Deps = {
  read: (locale: Locale, includeSeriesMembers: boolean) => Promise<LocalizedTemplate[]>
  toCard: (template: LocalizedTemplate) => CatalogueTemplate
}

const DEPS: Deps = { read: cachedWebTemplates, toCard: toCatalogueTemplate }

// Batch create's templates: every live web template that takes a photo, series members included
// (a member is as live and as priced as any other template, T102). Members matter twice: a series
// dialog's "Use Batch create" and a member workspace's "more templates" link arrive with a
// member's id in ?t=, and on the live catalogue most templates are members, so the picker lists
// them too. `wanted` is ?t=a,b: the ones found, once each, up to five (the form then keeps as
// many as the plan holds).
export async function loadBatchCatalogue(locale: Locale, wanted: string | string[] | undefined, deps: Deps = DEPS) {
  const found = await deps.read(locale, true)
  const templates = found.map(deps.toCard).filter((template) => template.photoInput !== 'none')
  const ids = typeof wanted === 'string' ? wanted.split(',') : []
  const initial = [...new Set(ids)].filter((id) => templates.some((template) => template.id === id)).slice(0, MATRIX_MAX_TEMPLATES)
  return { templates, initial }
}
