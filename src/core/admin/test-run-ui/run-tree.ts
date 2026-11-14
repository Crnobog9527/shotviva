import type { TestRunView } from '../test-runs'

// The records of ARCHITECTURE §10.b as a tree: one node per click on one parent (a ×3 batch on
// one result is one node with three runs; editing three results at once makes three nodes, one
// under each). Roots are first runs, and edits whose parent was cleaned up (orphan). Newest root
// first; under a run, its edits in the order they were made. Pure, so the panel is tested
// without a browser.

export type RunNode = {
  key: string
  kind: TestRunView['kind']
  parentId: string | null
  orphan: boolean
  runs: TestRunView[]
  // Edits made on each of this node's runs, by run id.
  children: Record<string, RunNode[]>
}

const byTime = (a: TestRunView, b: TestRunView) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

function groups(runs: readonly TestRunView[]): Map<string, TestRunView[]> {
  const map = new Map<string, TestRunView[]>()
  for (const run of [...runs].sort(byTime)) {
    // A translation batch covers several languages; each language is its own node (T87).
    const key = `${run.batchId}:${run.parentId ?? 'root'}:${run.kind === 'translate' ? run.targetLocale : ''}`
    map.set(key, [...(map.get(key) ?? []), run])
  }
  return map
}

export function buildRunTree(runs: readonly TestRunView[]): RunNode[] {
  const ids = new Set(runs.map((run) => run.id))
  const nodes = [...groups(runs).entries()].map(([key, members]): RunNode => {
    const parentId = members[0]!.parentId
    return { key, kind: members[0]!.kind, parentId, orphan: parentId !== null && !ids.has(parentId), runs: members, children: {} }
  })
  const owner = new Map(nodes.flatMap((node) => node.runs.map((run) => [run.id, node] as const)))
  const roots: RunNode[] = []
  for (const node of nodes) {
    const parent = node.parentId ? owner.get(node.parentId) : undefined
    if (parent && node.parentId) parent.children[node.parentId] = [...(parent.children[node.parentId] ?? []), node]
    else roots.push(node)
  }
  return roots.reverse()
}

export type BatchPlan<T> = T[]

// How many runs one click starts (ARCHITECTURE §10.b 「一次跑 3 张」): several targets (photos for a
// first run, results for an edit) run once each; one target, or none for a template without a
// photo, runs once or three times.
export function planBatch<T>(targets: readonly T[], triple: boolean): BatchPlan<T | null> {
  if (targets.length > 1) return [...targets]
  const one = targets[0] ?? null
  return triple ? [one, one, one] : [one]
}
