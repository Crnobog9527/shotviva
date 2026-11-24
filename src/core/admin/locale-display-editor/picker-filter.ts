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
function lineage(key: string, categories: readonly AdminCategoryNode[]): Set<string> {
  const byKey = new Map(categories.map((category) => [category.key, category]))
  const keys = new Set<string>()
  for (let at = byKey.get(key); at && !keys.has(at.key); at = at.parentId ? byKey.get(at.parentId) : undefined) keys.add(at.key)
  return keys
}

export const searchText = (template: AdminTemplate) =>
  [template.translations.zh?.name, template.name, template.id].filter(Boolean).join('\n').toLowerCase()

export type PickerQuery = { text: string; category: string | null }

// Published web templates matching the search, featured or not (the grid marks those already in
// the list); the shared catalogue order, so the picker reads like the templates page.
export function pickerResults(templates: readonly AdminTemplate[], categories: readonly AdminCategoryNode[], query: PickerQuery): AdminTemplate[] {
  const words = query.text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return addable(templates, []).filter((template) => {
    if (query.category && !lineage(template.category, categories).has(query.category)) return false
    const text = searchText(template)
    return words.every((word) => text.includes(word))
  })
}
