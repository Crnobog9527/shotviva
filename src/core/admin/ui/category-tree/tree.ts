export type TreeItem = { key: string; parentId: string | null; level: number; sortOrder: number }
export type TreeMove = { key: string; fromParent: string | null; parentId: string | null; beforeKey: string | null }

export function treeOrder<T extends Pick<TreeItem, 'key' | 'parentId' | 'sortOrder'>>(items: readonly T[]): T[] {
  const branches = new Map<string | null, T[]>()
  for (const item of items) {
    const branch = branches.get(item.parentId) ?? []
    branch.push(item)
    branches.set(item.parentId, branch)
  }
  function visit(parent: string | null): T[] {
    return (branches.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
      .flatMap(item => [item, ...visit(item.key)])
  }
  return visit(null)
}

export function validParents<T extends TreeItem>(items: readonly T[], moving: T, maxLevel: number): T[] {
  const subtree = new Set([moving.key])
  let height = 1
  for (const item of treeOrder(items)) {
    if (item.parentId !== null && subtree.has(item.parentId)) {
      subtree.add(item.key)
      height = Math.max(height, item.level - moving.level + 1)
    }
  }
  return items.filter(item => !subtree.has(item.key) && item.level + height <= maxLevel)
}

// Parent keys that have at least one child: what 「全部展开」 opens and what a stored state may hold.
export function parentKeys(items: readonly Pick<TreeItem, 'parentId'>[]): Set<string> {
  return new Set(items.flatMap(item => (item.parentId === null ? [] : [item.parentId])))
}

// The key itself and every ancestor above it, so a node a move or an add lands in is visible.
export function revealPath(items: readonly Pick<TreeItem, 'key' | 'parentId'>[], key: string | null): string[] {
  const byKey = new Map(items.map(item => [item.key, item]))
  const path: string[] = []
  for (let at = key; at !== null && !path.includes(at); at = byKey.get(at)?.parentId ?? null) {
    if (!byKey.has(at)) break
    path.push(at)
  }
  return path
}

// What the stored expanded keys mean against the current tree: unknown or childless keys drop out.
export function parseExpanded(raw: string | null, parents: ReadonlySet<string>): Set<string> {
  if (!raw) return new Set()
  try {
    const value: unknown = JSON.parse(raw)
    return new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && parents.has(key)) : [])
  } catch {
    return new Set()
  }
}
