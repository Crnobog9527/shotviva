import type { OutputAspect, Resolution } from '@/core/templates/output-options'

import type { TestRunView } from '../test-runs'

// A run the browser has just asked for, shown in the tree at once while its request (30–90 s)
// is still open; replaced by the server's row when it answers.
export type Placeholder = {
  id: string
  batchId: string
  kind: TestRunView['kind']
  parentId: string | null
  photoId: string | null
  resolution: Resolution
  aspect: OutputAspect | null
  instruction?: string
  note?: string
}

export function placeholderRun(p: Placeholder, now = new Date()): TestRunView {
  return {
    id: p.id,
    kind: p.kind,
    parentId: p.parentId,
    photoId: p.photoId,
    batchId: p.batchId,
    status: 'running',
    resolution: p.resolution,
    aspectRatio: p.aspect,
    copy: {},
    note: p.note || null,
    instruction: p.instruction || null,
    editScope: null,
    promptVersion: null,
    model: null,
    costUsd: null,
    estimateUsd: 0,
    durationMs: null,
    errorCode: null,
    isCover: false,
    createdAt: now.toISOString(),
    outputUrl: null,
  }
}

// The server's rows win over placeholders with the same id; the rest stay until answered.
export function mergeRuns(server: readonly TestRunView[], pending: readonly TestRunView[]): TestRunView[] {
  const known = new Set(server.map((run) => run.id))
  return [...pending.filter((run) => !known.has(run.id)), ...server]
}
