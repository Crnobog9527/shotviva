import type { MembershipTier } from '@/core/config'

import type { GenerateBody } from '../generation/job-api'
import type { StartInput } from '../generation/job-store'

// The batch preflight (T107, ARCHITECTURE §6.2 「多模板批次」): before any cell is charged the
// server checks the tier, the whole grid, every template's sale and the paid balance, and signs
// each cell. Every batch of two or more cells goes through it, single-template ones too, so each
// batch has an id: its ZIP, its group on Photos and its by-template / by-photo views hang on it.
export type PreflightCell = Pick<GenerateBody, 'template_id' | 'inputs' | 'expected_credits'> & { input_key: string; photo_name: string }

export type PreflightResult = {
  batch_id: string
  batch_size: number
  batch_templates: number
  total_credits: number
  cells: { expected_credits: number; batch_cell: NonNullable<GenerateBody['batch_cell']> }[]
}

export type PreflightError = { code: string; message?: string; required_tier?: MembershipTier; template_id?: string }

export type PreflightOutcome = { ok: true; result: PreflightResult } | { ok: false; error: PreflightError }

// A photo without a file name (kept from an earlier work) is named by its place in the batch.
export const photoNameFor = (name: string | undefined, index: number) => name?.trim() || `photo-${index + 1}`

export function preflightCells(inputs: readonly StartInput[], names: readonly string[]): PreflightCell[] | null {
  const cells: PreflightCell[] = []
  for (const [index, input] of inputs.entries()) {
    const body = input.body
    if (!('template_id' in body) || !body.input_key) return null
    cells.push({ template_id: body.template_id, input_key: body.input_key, inputs: body.inputs, expected_credits: body.expected_credits, photo_name: names[index] ?? photoNameFor(undefined, index) })
  }
  return cells
}

// Cells come back in the order sent (position i + 1), each with its signed proof and price.
export function withPreflight(inputs: readonly StartInput[], result: PreflightResult): StartInput[] {
  return inputs.map((input, index) => {
    const cell = result.cells[index]
    if (!cell || !('template_id' in input.body)) return input
    const body: GenerateBody = { ...input.body, expected_credits: cell.expected_credits, batch_id: result.batch_id, batch_templates: result.batch_templates, batch_cell: cell.batch_cell }
    return { ...input, credits: cell.expected_credits, batchId: result.batch_id, body }
  })
}

export async function preflightBatch(cells: readonly PreflightCell[]): Promise<PreflightOutcome> {
  try {
    const response = await fetch('/api/generate/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cells }),
    })
    const json: unknown = await response.json().catch(() => ({}))
    if (response.ok) return { ok: true, result: json as PreflightResult }
    const error = json as Partial<PreflightError>
    return { ok: false, error: { ...error, code: error.code ?? 'INTERNAL' } }
  } catch {
    return { ok: false, error: { code: 'NETWORK' } }
  }
}
