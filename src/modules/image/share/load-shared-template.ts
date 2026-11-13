import 'server-only'

import { isShareTemplateId } from '@/core/analytics/share-link'
import type { Locale } from '@/core/i18n/locales'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { GridEntry } from '../catalogue/catalogue-view'
import { loadCatalogueView } from '../catalogue/load-catalogue-view'

type Shown = Pick<CatalogueTemplate, 'id' | 'name' | 'description' | 'category' | 'categoryName' | 'compare' | 'cover'>

// What a share page may show of a template (Owner 2026-11-13): what the public catalogue card
// and dialog already show, nothing more. No prices, text fields, toggles or anything behind them.
export type SharedTemplate = Shown & { series: { name: string; members: Shown[] } | null }

const shown = ({ id, name, description, category, categoryName, compare, cover }: CatalogueTemplate): Shown => ({ id, name, description, category, categoryName, compare, cover })

// The template as Create would open it today, from the cached catalogue; null when it is not
// live on the web (unpublished, partner-only, deleted, a dense-text poster) or the id is no id.
export async function loadSharedTemplate(locale: Locale, templateId: string): Promise<SharedTemplate | null> {
  if (!isShareTemplateId(templateId)) return null
  const view = await loadCatalogueView(locale)
  return findShared(view.entries, templateId)
}

export function findShared(entries: readonly GridEntry[], templateId: string): SharedTemplate | null {
  for (const entry of entries) {
    if (entry.type === 'template' && entry.template.id === templateId) return { ...shown(entry.template), series: null }
    if (entry.type !== 'series') continue
    const member = entry.series.members.find((item) => item.id === templateId)
    if (member) return { ...shown(member), series: { name: entry.series.name, members: entry.series.members.map(shown) } }
  }
  return null
}
