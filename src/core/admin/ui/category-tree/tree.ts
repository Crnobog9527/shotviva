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
