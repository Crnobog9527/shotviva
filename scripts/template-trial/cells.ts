import { createHash } from 'node:crypto'

import type { AdminTemplate } from '../../src/core/admin/templates/types'
import type { Resolution } from '../../src/core/templates/output-options'
import type { TemplateItem } from '../template-apply/schema'
import type { TrialInput } from '../template-apply/trial-schema'

// One cell = one trial result to have: a template, one of its input sets, the k-th of n. Its content
// hash covers everything that changes the picture: the template, the prompt version and a digest of
// its body (never printed), the model that will actually run (the bound provider, or the site
// default resolved now, with its model name), style references, quality, fields, the input set
// with the photo's bytes, and the size. A cell is re-run only when one of those changes. Its run id
// comes from that hash, which occurrence of the same content it is among the template's input sets
// (so reordering, adding or removing other sets keeps it), k and the attempt number:
// admin_test_runs settles each run id once, so a resumed or repeated run finds the existing row
// instead of calling the model again.

// Attempts per cell across all runs (each run tries at most a few of them, see runner.ts).
export const MAX_ATTEMPTS = 10

export type Cell = {
  templateId: string
  version: number
  inputIndex: number
  // Which time this same content appears among the template's input sets (0 for the first).
  occurrence: number
  k: number
  hash: string
  resolution: Resolution
  input: TrialInput
  photoHash: string | null
  // A slot template's test images by slot (§5.1e): slot key → sha256 of its bytes.
  slotHashes: Record<string, string> | null
}

const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]))
    : value

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex')
}

// A v4-shaped UUID from a digest: run and batch ids must be UUIDs.
export function uuidFrom(hex: string): string {
  const h = hex.slice(0, 32).split('')
  h[12] = '4'
  h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16)
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

export const runIdOf = (cell: Cell, attempt: number) => uuidFrom(digest(['run', cell.hash, cell.occurrence, cell.k, attempt]))
// One batch per template and version, as one click of 「试跑」 shares a batch.
export const batchIdOf = (cell: Cell) => uuidFrom(digest(['batch', cell.templateId, cell.version]))

export type CellProblem = { templateId: string; problem: string }

// The model a template's trial will actually use: its bound provider, or the site default now.
export type EffectiveModel = (template: AdminTemplate) => { providerId: string; model: string }

// photoHashes: batch-relative photo path → sha256 of its bytes (read beforehand).
export function planCells(items: TemplateItem[], templates: Map<string, AdminTemplate>, photoHashes: Map<string, string>,
  options: { only?: Set<string>; n?: number; model: EffectiveModel }): { cells: Cell[]; problems: CellProblem[] } {
  const cells: Cell[] = []
  const problems: CellProblem[] = []
  for (const item of items) {
    if (!item.trial || (options.only && !options.only.has(item.id))) continue
    const template = templates.get(item.id)
    if (!template?.prompt) { problems.push({ templateId: item.id, problem: '模板不存在或没有提示词，先用 templates:apply 建好' }); continue }
    cells.push(...templateCells(item, template, photoHashes, options))
  }
  return { cells, problems }
}

function templateCells(item: TemplateItem, template: AdminTemplate, photoHashes: Map<string, string>, options: { n?: number; model: EffectiveModel }) {
  const prompt = template.prompt!
  const trial = item.trial!
  const n = options.n ?? trial.n ?? 1
  const resolution = trial.resolution ?? '1k'
  const base = { templateId: item.id, version: prompt.version, body: digest(prompt.body), params: prompt.modelParams,
    model: options.model(template), styleRefs: prompt.styleRefs.map(r => r.key), quality: template.quality, fields: template.fields, resolution }
  const seen = new Map<string, number>()
  const cells: Cell[] = []
  trial.inputs.forEach((input, inputIndex) => {
    const photoHash = input.photo ? photoHashes.get(input.photo) ?? null : null
    const slotHashes = input.slots ? Object.fromEntries(Object.entries(input.slots).map(([slot, path]) => [slot, photoHashes.get(path) ?? ''])) : null
    const hash = digest({ ...base, input: { ...input, photo: photoHash, ...(slotHashes ? { slots: slotHashes } : {}) } })
    const occurrence = seen.get(hash) ?? 0
    seen.set(hash, occurrence + 1)
    for (let k = 0; k < n; k++) cells.push({ templateId: item.id, version: prompt.version, inputIndex, occurrence, k, hash, resolution, input, photoHash, slotHashes })
  })
  return cells
}
