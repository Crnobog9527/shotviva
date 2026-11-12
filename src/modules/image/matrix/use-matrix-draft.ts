'use client'

import { useState } from 'react'

import type { Balance } from '@/core/billing/pools'

import { preflightBatch, preflightCells, withPreflight, type PreflightError } from '../batch/preflight'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { BatchCaps } from '../gated/feature-access'
import { enqueueJobs, setWorkspaceJobs } from '../generation/job-store'
import { closestResolution, selectedAspect } from '../workspace/output-choice'
import { usePhotoBatch } from '../workspace/use-photo-batch'
import { matrixCta } from './matrix-cta'
import { matrixStartInputs } from './matrix-request'
import { EMPTY_MATRIX, matrixBlock, matrixCells, matrixTotal, sharedOptions, type MatrixValues } from './matrix-state'

// The workspace view key of the multi-template batch in the generation store, so a refresh or
// a visit to Photos and back lands on the same results.
export const MATRIX_VIEW = 'matrix'

// `caps` is what one batch may hold on this plan (Pro 1 template × 10, Max 5 templates, 30 in all).
type Input = { templates: readonly CatalogueTemplate[]; initial: string[]; balance: Balance; limit: number; caps: BatchCaps }

export function useMatrixDraft({ templates, initial, balance, limit, caps }: Input) {
  const photos = usePhotoBatch(caps.cells)
  const [requested, setValues] = useState<MatrixValues>(() => ({ ...EMPTY_MATRIX, templateIds: initial.slice(0, caps.templates) }))
  const [checking, setChecking] = useState(false)
  // A refusal belongs to the photos it was about: adding or removing one clears it.
  const photoKey = photos.photos.map((photo) => photo.id).join(',')
  const [refusal, setRefusal] = useState<{ error: PreflightError; photoKey: string } | null>(null)
  const error = refusal?.photoKey === photoKey ? refusal.error : null
  const setError = (next: PreflightError | null) => setRefusal(next ? { error: next, photoKey } : null)
  const byId = new Map(templates.map((template) => [template.id, template]))
  const chosen = requested.templateIds.flatMap((id) => byId.get(id) ?? [])
  const options = sharedOptions(chosen)
  // A choice the current templates cannot make moves to the nearest one they share.
  const values = { ...requested, resolution: closestResolution(requested.resolution, options) ?? requested.resolution, aspect: selectedAspect(requested.aspect, options) }
  const cells = matrixCells(chosen, photos.photos.filter((photo) => photo.upload.phase !== 'error'), values)
  const block = matrixBlock(cells, chosen.length, { picked: photos.summary.planned, uploading: photos.summary.photo === 'uploading' }, options, caps.cells)
  const total = matrixTotal(cells)
  const count = cells.filter((cell) => !cell.removed).length
  const cta = matrixCta(block, total, count, balance, checking)

  const change = (next: (current: MatrixValues) => MatrixValues) => {
    setError(null)
    setValues(next)
  }

  // The preflight's refusal, or whether the batch was queued (false: nothing ready to send).
  const start = async (): Promise<{ error: PreflightError } | { started: boolean }> => {
    const request = cta.kind === 'generate' ? matrixStartInputs(cells, values, photos.summary.ready) : null
    const sent = request ? preflightCells(request.inputs, request.names) : null
    if (!request || !sent) return { started: false }
    setChecking(true)
    const outcome = await preflightBatch(sent)
    setChecking(false)
    if (!outcome.ok) {
      setError(outcome.error)
      return { error: outcome.error }
    }
    setWorkspaceJobs(MATRIX_VIEW, enqueueJobs(withPreflight(request.inputs, outcome.result), limit))
    return { started: true }
  }

  return { caps, photos, values, change, setValues, chosen, options, cells, total, count, cta, start, error }
}

export type MatrixDraft = ReturnType<typeof useMatrixDraft>
