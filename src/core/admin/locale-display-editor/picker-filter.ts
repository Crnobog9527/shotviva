import type { AdminCategoryNode } from '../template-categories/types'
import { treeOrder } from '../ui/category-tree/tree'
import type { AdminTemplate } from '../templates/types'
import { addable } from './display-state'

// The 首页精选 picker (Owner 2026-11-25): hundreds of templates, found by name and by the category
// tree instead of one long dropdown.

export type CategoryOption = { key: string; label: string; depth: number }

// Every category in tree order, labelled with its path (餐饮 › 中餐 › 火锅) so a sub-category with
// a common name is still clear.
export function categoryOptions(categories: readonly AdminCategoryNode[]): CategoryOption[] {
  const byKey = new Map(categories.map((category) => [category.key, category]))
  const path = (category: AdminCategoryNode): string[] => {
    const parent = category.parentId ? byKey.get(category.parentId) : undefined
    return [...(parent ? path(parent) : []), category.nameZh]
  }
  return treeOrder([...categories]).map((category) => ({ key: category.key, label: path(category).join(' › '), depth: path(category).length - 1 }))
}

// The category and all its ancestors, so filtering by 餐饮 also finds a template filed under 火锅.
// A template keeps its root in `category` and its deepest level in `subcategoryKey`.
function lineage(key: string, categories: readonly AdminCategoryNode[]): Set<string> {
  const byKey = new Map(categories.map((category) => [category.key, category]))
  const keys = new Set<string>()
  for (let at = byKey.get(key); at && !keys.has(at.key); at = at.parentId ? byKey.get(at.parentId) : undefined) keys.add(at.key)
  return keys
}

// A template is also found by its series' name (Owner 2026-11-27: 搜「木墩锦布」 finds the series).
export const searchText = (template: AdminTemplate, seriesNames?: ReadonlyMap<string, string>) =>
  [template.translations.zh?.name, template.name, template.id, template.seriesId ? seriesNames?.get(template.seriesId) : null]
    .filter(Boolean).join('\n').toLowerCase()

// series: open one series (its id, or NOT_IN_SERIES); null shows every match.
export type PickerQuery = { text: string; category: string | null; series?: string | null; seriesNames?: ReadonlyMap<string, string> }

// Published web templates matching the search, featured or not (the grid marks those already in
// the list); the shared catalogue order, so the picker reads like the templates page.
export function pickerResults(templates: readonly AdminTemplate[], categories: readonly AdminCategoryNode[], query: PickerQuery): AdminTemplate[] {
  const words = query.text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return addable(templates, []).filter((template) => {
    if (query.category && !lineage(template.subcategoryKey ?? template.category, categories).has(query.category)) return false
    if (query.series && (template.seriesId ?? NOT_IN_SERIES) !== query.series) return false
    const text = searchText(template, query.seriesNames)
    return words.every((word) => text.includes(word))
  })
}

// The 「不在系列里」 shelf's id; no series id can take it (series ids are uuids).
export const NOT_IN_SERIES = 'not-in-series'

export type SeriesShelf = { id: string; name: string; templates: AdminTemplate[] }

// The results as series shelves (Owner 2026-11-27: 餐饮 › 中餐 alone is 86 cards): each series in
// the order its first template comes in the catalogue, its templates in the series' own order,
// then the templates in no series. A series created after the options were read keeps its id as name.
export function seriesShelves(results: readonly AdminTemplate[], seriesNames: ReadonlyMap<string, string>, notInSeries: string): SeriesShelf[] {
  const shelves = new Map<string, SeriesShelf>()
  for (const template of results) {
    const id = template.seriesId ?? NOT_IN_SERIES
    const shelf = shelves.get(id) ?? { id, name: id === NOT_IN_SERIES ? notInSeries : seriesNames.get(id) ?? id, templates: [] }
    shelf.templates.push(template)
    shelves.set(id, shelf)
  }
  const single = shelves.get(NOT_IN_SERIES)
  shelves.delete(NOT_IN_SERIES)
  const ordered = [...shelves.values()]
  for (const shelf of ordered) shelf.templates.sort((a, b) => (a.seriesSortOrder ?? 0) - (b.seriesSortOrder ?? 0) || a.id.localeCompare(b.id))
  return single ? [...ordered, single] : ordered
}
