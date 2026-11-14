// 「发布为模板」 prefills (ARCHITECTURE §5 T101). The reference tree and the template tree are
// separate kinds, so a suggestion matches names level by level from the root and takes the deepest
// template category whose path agrees. The admin can always pick another one.
export type NamedNode = { key: string; nameZh: string; nameEn: string; parentId?: string | null; isSystem?: boolean }

const same = (a: NamedNode, b: NamedNode) =>
  a.nameZh === b.nameZh || a.nameEn.trim().toLowerCase() === b.nameEn.trim().toLowerCase()

export function nodePath<T extends NamedNode>(nodes: readonly T[], key: string | null): T[] {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  const path: T[] = []
  for (let node = key ? byKey.get(key) : undefined; node && path.length < 3; node = node.parentId ? byKey.get(node.parentId) : undefined) {
    path.unshift(node)
  }
  return path
}

export function suggestCategory(referencePath: readonly NamedNode[], templates: readonly NamedNode[]): string | null {
  let parent: string | null = null
  let match: string | null = null
  for (const level of referencePath) {
    const next = templates.find(node => (node.parentId ?? null) === parent && !node.isSystem && same(node, level))
    if (!next) break
    match = next.key
    parent = next.key
  }
  return match
}

// A readable default id from the reference's leaf name, unique enough with a slice of the run id.
export function suggestTemplateId(leafNameEn: string | undefined, runId: string) {
  const base = (leafNameEn ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
    .replace(/-+$/, '')
  return `${base || 'lab'}-${runId.replace(/-/g, '').slice(0, 6)}`
}
