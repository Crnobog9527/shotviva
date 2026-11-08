import { describe, expect, it } from 'vitest'

import type { TestRunView } from '../test-runs'
import { buildRunTree, planBatch } from './run-tree'

let clock = 0
function run(id: string, extra: Partial<TestRunView> = {}): TestRunView {
  clock += 1
  return {
    id,
    kind: extra.parentId ? 'edit' : 'generate',
    parentId: null,
    photoId: 'p1',
    batchId: `b-${id}`,
    status: 'succeeded',
    resolution: '1k',
    aspectRatio: '4:5',
    copy: {},
    note: null,
    instruction: null,
    sourceLocale: null,
    targetLocale: null,
    editScope: null,
    promptVersion: 1,
    model: 'gpt-image-2.6',
    costUsd: 0.05,
    estimateUsd: 0.07,
    durationMs: 30_000,
    errorCode: null,
    isCover: false,
    createdAt: `2026-11-08T00:00:${String(clock).padStart(2, '0')}Z`,
    outputUrl: 'https://r2/x',
    ...extra,
  }
}

describe('buildRunTree', () => {
  it('groups a ×3 click into one node and hangs edits under the run they edited', () => {
    const a = run('a', { batchId: 'b1' })
    const b = run('b', { batchId: 'b1' })
    const c = run('c', { batchId: 'b1' })
    const e1 = run('e1', { parentId: 'b', batchId: 'b2' })
    const e2 = run('e2', { parentId: 'b', batchId: 'b2' })
    const ee = run('ee', { parentId: 'e2', batchId: 'b3' })
    const tree = buildRunTree([ee, e2, e1, c, b, a])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.runs.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    const edits = tree[0]!.children.b!
    expect(edits).toHaveLength(1)
    expect(edits[0]!.runs.map((r) => r.id)).toEqual(['e1', 'e2'])
    expect(edits[0]!.children.e2![0]!.runs.map((r) => r.id)).toEqual(['ee'])
  })

  it('splits one edit click on three results into a node under each', () => {
    const roots = ['x', 'y', 'z'].map((id) => run(id, { batchId: 'first' }))
    const edits = ['x', 'y', 'z'].map((parent) => run(`e-${parent}`, { parentId: parent, batchId: 'edit-all' }))
    const [node] = buildRunTree([...roots, ...edits])
    expect(Object.keys(node!.children).sort()).toEqual(['x', 'y', 'z'])
  })

  it('shows newest first runs first and keeps an edit whose parent was cleaned up as an orphan root', () => {
    const old = run('old')
    const fresh = run('fresh')
    const orphan = run('orphan', { parentId: 'gone' })
    const tree = buildRunTree([old, fresh, orphan])
    expect(tree.map((node) => node.runs[0]!.id)).toEqual(['orphan', 'fresh', 'old'])
    expect(tree[0]!.orphan).toBe(true)
  })
})

describe('planBatch', () => {
  it('runs several targets once each, one target once or three times', () => {
    expect(planBatch(['p1', 'p2'], true)).toEqual(['p1', 'p2'])
    expect(planBatch(['p1'], true)).toEqual(['p1', 'p1', 'p1'])
    expect(planBatch(['p1'], false)).toEqual(['p1'])
    expect(planBatch([], true)).toEqual([null, null, null])
  })
})
