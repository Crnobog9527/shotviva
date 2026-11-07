import type { AdminTemplate } from '../templates/types'

// The home featured list (T53, ARCHITECTURE §12): at most 12, published web templates only.
export const FEATURED_LIMIT = 12

export const canFeature = (template: AdminTemplate) => template.isActive && template.visibleIn.includes('web')

// The featured ids in display order (featured_rank ascending).
export function featuredIds(templates: readonly AdminTemplate[]): string[] {
  return templates
    .filter((template) => template.featuredRank !== null)
    .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
    .map((template) => template.id)
}

// Switching one on appends it; switching it off drops it. Null when the list would not change
// or would break the rules (13th template, not published on the web).
export function toggleFeatured(ids: readonly string[], template: AdminTemplate, on: boolean): string[] | null {
  const has = ids.includes(template.id)
  if (on === has) return null
  if (!on) return ids.filter((id) => id !== template.id)
  if (!canFeature(template) || ids.length >= FEATURED_LIMIT) return null
  return [...ids, template.id]
}
