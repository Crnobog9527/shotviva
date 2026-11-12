import type { Selection } from './catalogue-filter'
import { hasStills, isCompareCategory } from './catalogue-template'
import type { FilterNode, GridEntry } from './catalogue-view'

// Cards a section holds in All: a phone's rail scrolls through these, then ends on 「查看全部」.
// From md up a section shows one row (two or three cards; three or four drag compares, which are
// also a grid of four on phones), set by the section's CSS; the rest is one tap away on the
// category itself.
export const SECTION_LIMIT = 8

export type CatalogueSection = {
  slug: string
  // The category key analytics sends (the slug when the tree is not there).
  key: string
  name: string
  intro: string | null
  // Every card under this root category, not only the ones the section draws.
  total: number
  entries: GridEntry[]
  // Every card is the tall drag compare (画风): the section takes more, narrower columns.
  compare: boolean
}

// The Art Styles compare: the tall card (one row taller in the flat grid from md up).
export const isTall = (entry: GridEntry) => entry.type === 'template' && isCompareCategory(entry.template) && hasStills(entry.template)

// Create's All view (Owner 2026-11-12): one section per root category, in 分类管理's order (the
// chip tree is already in that order and trimmed to categories with cards), each with its first
// cards in the catalogue's own order (the admin's drag order), never shuffled.
export function catalogueSections(filters: readonly FilterNode[], entries: readonly GridEntry[], limit = SECTION_LIMIT): CatalogueSection[] {
  return filters.flatMap((node) => {
    const inside = entries.filter((entry) => entry.path[0] === node.slug)
    if (inside.length === 0) return []
    return [{
      slug: node.slug,
      key: node.key ?? node.slug,
      name: node.name,
      intro: node.intro ?? null,
      total: inside.length,
      entries: inside.slice(0, limit),
      compare: inside.every(isTall),
    }]
  })
}

// Sections only on All, and only with two or more categories; a chosen category, Saved, or a
// catalogue of one category keeps the flat grid.
export function sectionsFor(active: Selection, sections: CatalogueSection[]): CatalogueSection[] | null {
  return !active.saved && active.path.length === 0 && sections.length > 1 ? sections : null
}
