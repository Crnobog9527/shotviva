import type { Locale } from '@/core/i18n'
import type { CatalogueIndex } from '@/core/templates'
import type { CategoryNode } from '@/core/templates/taxonomy'

// How far a 精选组合 reaches into the catalogue (Owner 2026-11-25): first-time visitors must not
// read "5 templates" on a bundle card as all the site has. Each card ends on a way to the rest:
// every template of the one category its members share (the deepest one), or all templates. The
// numbers are live, counted from the same cached catalogue the page shows.

// The chip at the end of a bundle card's names: the shared category's name and its slug path
// (the browse list's chip path), or null name and an empty path for every template.
export type BundleMore = { name: string | null; count: number; path: string[] }

type Index = Pick<CatalogueIndex, 'tree' | 'entries' | 'series'>

// Each node by key, with the nodes from the root down to it.
function chains(tree: readonly CategoryNode[], above: CategoryNode[] = [], into = new Map<string, CategoryNode[]>()) {
  for (const node of tree) {
    const chain = [...above, node]
    into.set(node.key, chain)
    chains(node.children, chain, into)
  }
  return into
}

// Where every live template sits (one place each, onePlace): the chain of its category, through
// its series' entry for a series member.
export function placements(index: Index, liveIds: ReadonlySet<string>): Map<string, CategoryNode[]> {
  const byKey = chains(index.tree)
  const membersOf = new Map(index.series.map((series) => [series.id, series.memberIds]))
  const placed = new Map<string, CategoryNode[]>()
  for (const entry of index.entries) {
    const chain = byKey.get(entry.categoryKey)
    if (!chain) continue
    const ids = entry.type === 'series' ? (membersOf.get(entry.id) ?? []) : [entry.id]
    for (const id of ids) if (liveIds.has(id) && !placed.has(id)) placed.set(id, chain)
  }
  return placed
}

// The deepest category every member sits in, or null (a member not placed, or no shared root).
function sharedNode(memberIds: readonly string[], placed: ReadonlyMap<string, CategoryNode[]>): CategoryNode | null {
  const chainsOf = memberIds.map((id) => placed.get(id))
  if (chainsOf.length === 0 || chainsOf.some((chain) => !chain)) return null
  const [first, ...rest] = chainsOf as CategoryNode[][]
  let shared: CategoryNode | null = null
  for (const [depth, node] of first!.entries()) {
    if (!rest.every((chain) => chain[depth]?.key === node.key)) break
    shared = node
  }
  return shared
}

export function bundleMore(memberIds: readonly string[], placed: ReadonlyMap<string, CategoryNode[]>, total: number, locale: Locale): BundleMore {
  const node = sharedNode(memberIds, placed)
  if (!node) return { name: null, count: total, path: [] }
  let count = 0
  for (const chain of placed.values()) if (chain.some((step) => step.key === node.key)) count += 1
  return { name: locale === 'zh' ? node.nameZh : node.nameEn, count, path: node.path }
}
