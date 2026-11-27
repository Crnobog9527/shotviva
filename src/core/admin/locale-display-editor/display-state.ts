import { orderSiblings, type LocaleDisplay } from '@/core/templates/locale-display'

import type { DisplayLocale } from '../locale-display/types'
import type { AdminCategoryNode } from '../template-categories/types'
import { isFeaturable } from '../templates/bulk-featured-rules'
import type { AdminTemplate } from '../templates/types'

export type SiblingGroup = {
  // null: the top level.
  parent: string | null
  title: string
  keys: string[]
  // This language saved an order for the group; otherwise it follows the shared one.
  own: boolean
}

// Every group of siblings with two or more members (one cannot be ordered), in the language's
// effective order: the top level first, then each parent that has such children.
export function siblingGroups(categories: readonly AdminCategoryNode[], display: LocaleDisplay, locale: DisplayLocale): SiblingGroup[] {
  const saved = display.categoryOrder[locale] ?? {}
  const byParent = new Map<string | null, AdminCategoryNode[]>()
  for (const category of categories) byParent.set(category.parentId, [...(byParent.get(category.parentId) ?? []), category])
  const nameOf = (key: string) => categories.find((category) => category.key === key)?.nameZh ?? key
  const groups: SiblingGroup[] = []
  const visit = (parent: string | null) => {
    const members = orderSiblings(byParent.get(parent) ?? [], saved)
    if (members.length > 1) {
      groups.push({
        parent, title: parent === null ? '一级分类' : `「${nameOf(parent)}」下的子分类`,
        keys: members.map((member) => member.key), own: members.some((member) => member.key in saved),
      })
    }
    for (const member of members) visit(member.key)
  }
  visit(null)
  return groups
}

export type FeaturedState = {
  // The language has its own list; otherwise it shows the shared one.
  own: boolean
  ids: string[]
}

export const featurable = (template: AdminTemplate | undefined): template is AdminTemplate =>
  Boolean(template && !template.deletedAt && isFeaturable(template))

// What the language's featured list is now: its own list (templates no longer published are
// dropped, as the public page drops them), or the shared list while it has none.
export function featuredState(templates: readonly AdminTemplate[], display: LocaleDisplay, locale: DisplayLocale): FeaturedState {
  const byId = new Map(templates.map((template) => [template.id, template]))
  const own = display.featured[locale] ?? []
  if (own.length > 0) return { own: true, ids: own.filter((id) => featurable(byId.get(id))) }
  const shared = templates.filter((template) => template.featuredRank !== null && featurable(template))
    .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
  return { own: false, ids: shared.map((template) => template.id) }
}

// Templates that could be added: published on the web and not already in the list.
export function addable(templates: readonly AdminTemplate[], ids: readonly string[]): AdminTemplate[] {
  const taken = new Set(ids)
  return templates.filter((template) => featurable(template) && !taken.has(template.id))
}
