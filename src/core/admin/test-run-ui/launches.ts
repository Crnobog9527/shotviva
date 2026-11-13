import { DEFAULT_RESOLUTION, type OutputAspect, type Resolution } from '@/core/templates/output-options'

import type { TestRunView } from '../test-runs'
import { startEdit, startGenerate } from './api'
import { planBatch } from './run-tree'
import type { RunOptionValues } from './run-options'
import type { Launch } from './use-test-panel'

// One click → the runs it starts (ARCHITECTURE §10.b 「一次跑 3 张」), each with its own id made
// here so a retried request lands on the same run, and one batch id for the click.

const uuid = () => crypto.randomUUID()

// slotPhotos: a slot template's test photos by slot (§5.1e); its runs then take no single photo.
type FirstRunValues = { omitStyleRefs: boolean; providerId: string | null; copy: Record<string, string>; note: string; toggles: Record<string, boolean>; options: RunOptionValues; slotPhotos?: Record<string, string> }

export function firstRunLaunches(templateId: string, photoIds: readonly string[], values: FirstRunValues): Launch[] {
  const batchId = uuid()
  const resolution: Resolution = values.options.resolution || DEFAULT_RESOLUTION
  const aspect = (values.options.aspect || 'original') as OutputAspect
  return planBatch(photoIds, values.options.triple).map((photoId) => {
    const runId = uuid()
    return {
      placeholder: { id: runId, batchId, kind: 'generate', parentId: null, photoId, resolution, aspect, note: values.note.trim(), toggles: values.toggles },
      start: () => startGenerate({ omitStyleRefs: values.omitStyleRefs, providerId: values.providerId, runId, batchId, templateId, photoId, slotPhotos: values.slotPhotos, copy: values.copy, note: values.note, toggles: values.toggles, resolution, aspect }),
    }
  })
}

export function editLaunches(targets: readonly TestRunView[], instruction: string, options: RunOptionValues): Launch[] {
  const batchId = uuid()
  const resolution = options.resolution || undefined
  const aspect = options.aspect || undefined
  return planBatch(targets, options.triple).flatMap((target) => {
    if (!target) return []
    const runId = uuid()
    return [
      {
        placeholder: {
          id: runId,
          batchId,
          kind: 'edit' as const,
          parentId: target.id,
          photoId: target.photoId,
          resolution: resolution ?? target.resolution,
          aspect: aspect ?? (target.aspectRatio as OutputAspect | null),
          instruction,
        },
        start: () => startEdit({ runId, batchId, parentId: target.id, instruction, resolution, aspect }),
      },
    ]
  })
}
