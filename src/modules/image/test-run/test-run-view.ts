import type { TestRunView } from '@/core/admin/test-runs'

import type { TestRun } from './test-run-row'

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

function copyOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function togglesOf(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'))
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
    toggles: togglesOf(run.inputs.toggles),
    instruction: text(run.inputs.instruction),
    sourceLocale: text(run.inputs.source_locale),
    targetLocale: text(run.inputs.target_locale),
    editScope: text(run.inputs.edit_scope),
    // A translation's prompt is the edit template's (T87); the panel labels it 编辑模板 vN.
    promptVersion: run.promptVersion ?? (typeof run.inputs.translate_prompt_version === 'number' ? run.inputs.translate_prompt_version : null),
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
