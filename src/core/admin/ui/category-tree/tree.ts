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

// Where a sibling must land so it ends up at `position` (1-based, clamped) in its list: the key it goes
// before, null for the end, or undefined when it is already there. Feeds the same TreeMove as a drag.
export function positionBefore(siblingKeys: readonly string[], key: string, position: number): string | null | undefined {
  const from = siblingKeys.indexOf(key)
  if (from < 0 || !Number.isFinite(position)) return undefined
  const to = Math.min(Math.max(Math.round(position), 1), siblingKeys.length) - 1
  if (to === from) return undefined
  return siblingKeys.filter(item => item !== key)[to] ?? null
}

// A drag dropped on `overKey`, above (after = false) or below it: the key it goes before, or undefined for no change.
export function dropBefore(siblingKeys: readonly string[], key: string, overKey: string, after: boolean): string | null | undefined {
  const rest = siblingKeys.filter(item => item !== key)
  const at = rest.indexOf(overKey)
  if (at < 0 || !siblingKeys.includes(key)) return undefined
  const before = rest[after ? at + 1 : at] ?? null
  const current = siblingKeys[siblingKeys.indexOf(key) + 1] ?? null
  return before === current ? undefined : before
}
