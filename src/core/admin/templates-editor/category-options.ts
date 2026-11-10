import { treeOrder } from '../ui/category-tree/tree'

export type CategoryOption = {
  key: string
  nameZh: string
  nameEn: string
  isSystem: boolean
  parentId?: string | null
  sortOrder?: number
}

type CategoryChoice = { key: string; label: string; nameEn: string; path: string[] }

// Use the management tree's sibling order. Each native option includes its
// whole path so identically named nodes in different branches remain distinct.
export function categoryChoices(categories: readonly CategoryOption[]): CategoryChoice[] {
  const choices = new Map<string, CategoryChoice>()
  const nodes = categories.filter(node => !node.isSystem).map((node, index) => ({
    ...node, parentId: node.parentId ?? null, sortOrder: node.sortOrder ?? index,
  }))
  for (const node of treeOrder(nodes)) {
    const parent = node.parentId ? choices.get(node.parentId) : undefined
    choices.set(node.key, {
      key: node.key, nameEn: node.nameEn,
      label: parent ? `${parent.label} / ${node.nameZh}` : node.nameZh,
      path: [...(parent?.path ?? []), node.key],
    })
  }
  return [...choices.values()]
}
