import type { Locale } from '../i18n/locales'
import type { CategoryNode } from './taxonomy'

// Per-language display rules (migration 1575): the home page, its featured sections and Create's
// category tree each read their language's own category order and featured list. A language with
// nothing saved follows the shared order (template_categories.sort_order, templates.featured_rank),
// so nothing changes until an admin sets one. The shared columns still drive SEO pages.
export type LocaleDisplay = {
  // category key -> position among its siblings, per language; only sibling groups an admin saved.
  categoryOrder: Partial<Record<Locale, Record<string, number>>>
  // The language's featured template ids in order; absent or empty follows the shared list.
  featured: Partial<Record<Locale, string[]>>
}

export const NO_LOCALE_DISPLAY: LocaleDisplay = { categoryOrder: {}, featured: {} }

type Sibling = { key: string; sortOrder: number }

// A saved position wins; a category added after the order was saved (no position) goes after the
// saved ones, in the shared order, so a new category never lands in the middle.
export function orderSiblings<T extends Sibling>(items: readonly T[], saved: Record<string, number> = {}): T[] {
  const rank = (item: T) => (item.key in saved ? [0, saved[item.key]] : [1, item.sortOrder])
  return [...items].sort((a, b) => {
    const [ga, oa] = rank(a)
    const [gb, ob] = rank(b)
    return ga - gb || oa - ob || a.key.localeCompare(b.key)
  })
}

export function orderTree(tree: CategoryNode[], saved: Record<string, number> | undefined): CategoryNode[] {
  if (!saved || Object.keys(saved).length === 0) return tree
  return orderSiblings(tree, saved).map((node) => ({ ...node, children: orderTree(node.children, saved) }))
}

type Shown = {
  id: string
  category: string
  categoryView: { sortOrder: number }
  featuredRank: number | null
}

// The live catalogue as one language shows it: the root categories in that language's order (the
// home sections group by them) and its own featured list when it has one.
export function applyLocaleDisplay<T extends Shown>(templates: readonly T[], display: LocaleDisplay, locale: Locale): T[] {
  const roots = new Map(templates.map((template) => [template.category, { key: template.category, sortOrder: template.categoryView.sortOrder }]))
  const position = new Map(orderSiblings([...roots.values()], display.categoryOrder[locale]).map((root, index) => [root.key, index * 10]))
  const list = display.featured[locale] ?? []
  const ranks = new Map(list.map((id, index) => [id, index + 1]))
  const own = list.length > 0
  return templates.map((template) => ({
    ...template,
    categoryView: { ...template.categoryView, sortOrder: position.get(template.category) ?? template.categoryView.sortOrder },
    featuredRank: own ? ranks.get(template.id) ?? null : template.featuredRank,
  }))
}
