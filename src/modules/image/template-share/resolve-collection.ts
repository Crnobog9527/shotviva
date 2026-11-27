import type { TemplateShareItem } from '@/core/template-shares/rules'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { GridEntry } from '../catalogue/catalogue-view'
import { shown, type Shown } from '../share/load-shared-template'

// What a template collection page may show (ARCHITECTURE §5.1g): what the public catalogue card
// shows, nothing more (as /t, load-shared-template.ts). A series carries its live members.
export type CollectionSeries = { id: string; name: string; description: string | null; cover: string | null; categoryName: string; members: Shown[] }
export type CollectionEntry = { type: 'template'; template: Shown } | { type: 'series'; series: CollectionSeries }

// Dense-text poster templates (§5.3) are never shared: their card leads to the poster editor.
const offered = (template: CatalogueTemplate) => !template.poster

function templateIn(entries: readonly GridEntry[], id: string): CatalogueTemplate | null {
  for (const entry of entries) {
    if (entry.type === 'template' && entry.template.id === id) return entry.template
    if (entry.type === 'series') {
      const member = entry.series.members.find((item) => item.id === id)
      if (member) return member
    }
  }
  return null
}

function seriesIn(entries: readonly GridEntry[], id: string): CollectionSeries | null {
  for (const entry of entries) {
    if (entry.type !== 'series' || entry.series.id !== id) continue
    const members = entry.series.members.filter(offered).map(shown)
    if (members.length === 0) return null
    const { name, description, cover, categoryName } = entry.series
    return { id, name, description, cover, categoryName, members }
  }
  return null
}

// The picked entries in the order they were picked, each as the live catalogue has it now; an
// entry that is no longer live (unpublished, partner-only, removed, a poster) drops out.
export function resolveCollection(entries: readonly GridEntry[], items: readonly TemplateShareItem[]): CollectionEntry[] {
  return items.flatMap((item): CollectionEntry[] => {
    if (item.type === 'series') {
      const series = seriesIn(entries, item.id)
      return series ? [{ type: 'series', series }] : []
    }
    const template = templateIn(entries, item.id)
    return template && offered(template) ? [{ type: 'template', template: shown(template) }] : []
  })
}
