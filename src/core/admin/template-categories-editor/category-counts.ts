import type { AdminCategoryNode } from '../template-categories/types'

export type CategoryCounts = { templates: number; series: number; directTemplates: number; directSeries: number }

// What a row in 分类管理 shows (Owner 2026-11-27): a parent counts everything under it, so 餐饮 is
// not 「没有模板」 while 中餐 holds 86. Each template is counted on one row only (its deepest level,
// migration 1086) and each series on its own category, so adding a subtree's rows counts every
// template and series once.
export function rolledUpCounts(nodes: readonly AdminCategoryNode[]): Map<string, CategoryCounts> {
  const children = new Map<string | null, AdminCategoryNode[]>()
  for (const node of nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const counts = new Map<string, CategoryCounts>()
  const visit = (node: AdminCategoryNode, path: ReadonlySet<string>): CategoryCounts => {
    const known = counts.get(node.key)
    if (known) return known
    const total = { templates: node.templateCount, series: node.seriesCount, directTemplates: node.templateCount, directSeries: node.seriesCount }
    for (const child of children.get(node.key) ?? []) {
      if (path.has(child.key)) continue
      const sub = visit(child, new Set([...path, child.key]))
      total.templates += sub.templates
      total.series += sub.series
    }
    counts.set(node.key, total)
    return total
  }
  for (const node of nodes) visit(node, new Set([node.key]))
  return counts
}
