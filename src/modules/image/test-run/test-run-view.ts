import type { TestRunView } from '@/core/admin/test-runs'

import type { TestRun } from './test-run-row'

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

function copyOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

// `model`: the model part of `<provider id>/<model>` (the address and id stay out of the panel).
export function toTestRunView(run: TestRun, outputUrl: string | null): TestRunView {
  return {
    id: run.id,
    kind: run.kind,
    parentId: run.parentId,
    photoId: run.photoId,
    batchId: run.batchId,
    status: run.status,
    resolution: run.resolution,
    aspectRatio: text(run.inputs.aspect_ratio),
    copy: copyOf(run.inputs.copy),
    note: text(run.inputs.note),
    instruction: text(run.inputs.instruction),
    editScope: text(run.inputs.edit_scope),
    promptVersion: run.promptVersion,
    model: run.provider ? run.provider.slice(run.provider.indexOf('/') + 1) : null,
    costUsd: run.costUsd,
    estimateUsd: run.estimateUsd,
    durationMs: run.durationMs,
    errorCode: run.errorCode,
    isCover: run.coverSetAt !== null,
    createdAt: run.createdAt,
    outputUrl,
  }
}
