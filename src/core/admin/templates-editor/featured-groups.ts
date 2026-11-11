import type { AdminTemplate } from '../templates/types'

// The admin's picture of the home template area (ARCHITECTURE §12 home item 3): the same grouping
// and order as site/content/home-templates.ts `grouped()`. One group per root category, met in
// featured order, then stably sorted by the category's position in 分类管理; inside a group the
// featured order. featured-groups.test.ts pins the same cases; change both together.

type GroupTemplate = Pick<AdminTemplate, 'id' | 'category' | 'categoryInfo'>
export type FeaturedGroup = { key: string; nameZh: string; nameEn: string; ids: string[] }

export function featuredGroups(ids: readonly string[], byId: ReadonlyMap<string, GroupTemplate>): FeaturedGroup[] {
  const groups = new Map<string, { group: FeaturedGroup; sortOrder: number }>()
  for (const id of ids) {
    const template = byId.get(id)
    if (!template) continue
    const { nameZh, nameEn, sortOrder } = template.categoryInfo
    const entry = groups.get(template.category) ?? { group: { key: template.category, nameZh, nameEn, ids: [] }, sortOrder }
    entry.group.ids.push(id)
    groups.set(template.category, entry)
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((entry) => entry.group)
}

// The whole list in display order after one group is reordered: groups in page order, so the
// first card on the page is also featured_rank 1 (the generator's default template).
export function withGroupOrder(groups: readonly FeaturedGroup[], key: string, ids: readonly string[]): string[] {
  return groups.flatMap((group) => (group.key === key ? [...ids] : group.ids))
}

export const sameMembers = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))
