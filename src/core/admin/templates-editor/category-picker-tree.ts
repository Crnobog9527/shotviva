import { categoryChoices, type CategoryOption } from './category-options'

export type PickerNode = {
  key: string
  nameZh: string
  nameEn: string
  // The whole path in Chinese (「餐饮 / 西餐 / 西餐暗调质感」), what the closed picker shows.
  label: string
  depth: number
  parentKey: string | null
  hasChildren: boolean
}

// The management tree's order (category-options.ts), each node with its depth and parent, so the
// picker can draw level 1 / 2 / 3 as an indented tree. System categories are not offered.
export function pickerNodes(categories: readonly CategoryOption[]): PickerNode[] {
  const byKey = new Map(categories.map(category => [category.key, category]))
  const choices = categoryChoices(categories)
  const parents = new Set(choices.flatMap(choice => (choice.path.length > 1 ? [choice.path[choice.path.length - 2]!] : [])))
  return choices.map(choice => ({
    key: choice.key,
    nameZh: byKey.get(choice.key)?.nameZh ?? choice.label,
    nameEn: choice.nameEn,
    label: choice.label,
    depth: choice.path.length - 1,
    parentKey: choice.path.length > 1 ? choice.path[choice.path.length - 2]! : null,
    hasChildren: parents.has(choice.key),
  }))
}

// The node's ancestors, nearest last: what has to be open for it to show.
export function ancestorsOf(nodes: readonly PickerNode[], key: string): string[] {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  const path: string[] = []
  for (let at = byKey.get(key)?.parentKey ?? null; at && !path.includes(at); at = byKey.get(at)?.parentKey ?? null) path.unshift(at)
  return path
}

const matches = (node: PickerNode, query: string) =>
  [node.key, node.label, node.nameEn].some(text => text.toLowerCase().includes(query))

// Without a query: the rows whose every ancestor is open. With one: the matching rows and the
// branches above them, all shown open, so a hit three levels down is in view at once.
export function visibleNodes(nodes: readonly PickerNode[], expanded: ReadonlySet<string>, query: string): PickerNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes.filter(node => ancestorsOf(nodes, node.key).every(key => expanded.has(key)))
  const shown = new Set<string>()
  for (const node of nodes) {
    if (!matches(node, q)) continue
    shown.add(node.key)
    for (const key of ancestorsOf(nodes, node.key)) shown.add(key)
  }
  return nodes.filter(node => shown.has(node.key))
}
