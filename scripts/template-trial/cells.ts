import { createHash } from 'node:crypto'

import type { AdminTemplate } from '../../src/core/admin/templates/types'
import type { Resolution } from '../../src/core/templates/output-options'
import type { TemplateItem } from '../template-apply/schema'
import type { TrialInput } from '../template-apply/trial-schema'

// One cell = one trial result to have: a template, one of its input sets, the k-th of n. Its content
// hash covers everything that changes the picture (prompt version, which also moves with the body,
// parameters, model binding and style references; the model; quality; fields; the input set and the
// photo's bytes; size), so a cell is re-run only when one of those changes. Its run id is derived
// from that hash and the attempt number: admin_test_runs settles each run id once, so a resumed or
// repeated run finds the existing row instead of calling the model again.

export const MAX_ATTEMPTS = 3

export type Cell = {
  templateId: string
  version: number
  inputIndex: number
  k: number
  hash: string
  resolution: Resolution
  input: TrialInput
  photoHash: string | null
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

export const runIdOf = (cell: Cell, attempt: number) => uuidFrom(digest(['run', cell.hash, cell.inputIndex, cell.k, attempt]))
// One batch per template and version, as one click of 「试跑」 shares a batch.
export const batchIdOf = (cell: Cell) => uuidFrom(digest(['batch', cell.templateId, cell.version]))

export type CellProblem = { templateId: string; problem: string }

// photoHashes: batch-relative photo path → sha256 of its bytes (read beforehand).
export function planCells(items: TemplateItem[], templates: Map<string, AdminTemplate>, photoHashes: Map<string, string>,
  options: { only?: Set<string>; n?: number }): { cells: Cell[]; problems: CellProblem[] } {
  const cells: Cell[] = []
  const problems: CellProblem[] = []
  for (const item of items) {
    if (!item.trial || (options.only && !options.only.has(item.id))) continue
    const template = templates.get(item.id)
    if (!template?.prompt) { problems.push({ templateId: item.id, problem: '模板不存在或没有提示词，先用 templates:apply 建好' }); continue }
    const n = options.n ?? item.trial.n ?? 1
    const resolution = item.trial.resolution ?? '1k'
    // The template id too: two templates with the same content are still two sets of runs.
    const base = { templateId: item.id, version: template.prompt.version, provider: template.prompt.providerId, styleRefs: template.prompt.styleRefs.map(r => r.key),
      quality: template.quality, fields: template.fields, resolution }
    item.trial.inputs.forEach((input, inputIndex) => {
      const photoHash = input.photo ? photoHashes.get(input.photo) ?? null : null
      const hash = digest({ ...base, input: { ...input, photo: photoHash } })
      for (let k = 0; k < n; k++) cells.push({ templateId: item.id, version: template.prompt!.version, inputIndex, k, hash, resolution, input, photoHash })
    })
  }
  return { cells, problems }
}
