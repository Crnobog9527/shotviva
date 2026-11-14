import type { StartInput } from '../generation/job-store'
import { toggleRequest } from '../toggles'
import { chosenAspect } from '../workspace/output-choice'
import { photoNameFor } from '../batch/preflight'
import type { ReadyPhoto } from '../workspace/photo-batch'
import { keptCells, sharedOptions, type MatrixCell, type MatrixValues } from './matrix-state'

export type MatrixStart = { inputs: StartInput[]; names: string[] }

// One job per kept cell, in grid order (the batch position). Every cell has the batch's one
// resolution and one size: when the templates cannot follow each photo's own shape, the first
// photo's nearest shared size is used for all. Text is the template's shared text with the
// photo's override on top; toggles are the template's.
export function matrixStartInputs(cells: readonly MatrixCell[], values: MatrixValues, ready: readonly ReadyPhoto[]): MatrixStart | null {
  const kept = keptCells(cells)
  const byId = new Map(ready.map((entry, index) => [entry.photo.id, { entry, index }]))
  if (kept.length === 0 || kept.some((cell) => !byId.has(cell.photo.id))) return null
  const options = sharedOptions([...new Set(kept.map((cell) => cell.template))])
  const first = byId.get(kept[0]!.photo.id)!.entry.photo
  const aspect = chosenAspect(values.aspect, options, first.originalRatio)
  if (!aspect || !options.resolutions.includes(values.resolution)) return null
  const inputs = kept.map((cell): StartInput => {
    const { entry } = byId.get(cell.photo.id)!
    const { template } = cell
    const toggles = toggleRequest(template.toggles, values.toggles[template.id] ?? {})
    return {
      templateId: template.id,
      templateName: template.name,
      resolution: values.resolution,
      aspect,
      credits: cell.credits,
      inputKey: entry.inputKey,
      previewUrl: entry.photo.url,
      body: { expected_credits: cell.credits, template_id: template.id, input_key: entry.inputKey, inputs: { copy: cell.copy, resolution: values.resolution, aspect_ratio: aspect, ...toggles } },
    }
  })
  const names = kept.map((cell) => {
    const { entry, index } = byId.get(cell.photo.id)!
    return photoNameFor(entry.photo.name, index)
  })
  return { inputs, names }
}
