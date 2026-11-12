import { limitsFor } from '@/core/billing/tier-limits'
import { MAX_BATCH_TEMPLATES } from '@/core/jobs/batch/limits'
import type { ImageOptions } from '@/core/templates/image-options'
import { RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { ReadyPhoto } from '../workspace/photo-batch'
import { missingRequiredCopy } from '../workspace/copy-check'

// The Max multi-template batch (T107, ARCHITECTURE §6.2 「多模板批次」): 1–5 templates × the
// picked photos, one job per kept cell, at most TIER_LIMITS.max.batchMax cells. Size and
// resolution are one choice for the whole batch; text is filled once per template and shared by
// its photos, with an optional per-photo override; toggles are set per template. Pure, so the
// grid, the prices and the request can be tested without a browser.
export const MATRIX_MAX_CELLS = limitsFor('max').batchMax
export const MATRIX_MAX_TEMPLATES = MAX_BATCH_TEMPLATES

export type CellKey = `${string}|${string}`
export const cellKey = (templateId: string, photoId: string): CellKey => `${templateId}|${photoId}`

export type MatrixValues = {
  templateIds: string[]
  // Cells the user took out of the grid (cellKey).
  removed: CellKey[]
  // Shared text per template, then per-photo changes on top of it (cellKey → field → text).
  copy: Record<string, Record<string, string>>
  overrides: Record<CellKey, Record<string, string>>
  toggles: Record<string, Record<string, boolean>>
  resolution: Resolution
  aspect: OutputAspect
}

export const EMPTY_MATRIX: MatrixValues = { templateIds: [], removed: [], copy: {}, overrides: {}, toggles: {}, resolution: '1k', aspect: 'original' }

export type MatrixPhoto = { id: string; originalRatio?: number }

export type MatrixCell = { key: CellKey; template: CatalogueTemplate; photo: MatrixPhoto; credits: number; removed: boolean; copy: Record<string, string> }

// What every chosen template can make: the sizes and resolutions they share. A batch is one
// size and one resolution (the preflight refuses a mixed one).
export function sharedOptions(templates: readonly CatalogueTemplate[]): ImageOptions {
  const all = templates.map((template) => template.imageOptions).filter((options): options is ImageOptions => options !== undefined)
  if (all.length === 0) return { resolutions: [...RESOLUTIONS], aspectRatios: [], originalRatio: true }
  return {
    resolutions: RESOLUTIONS.filter((tier) => all.every((options) => options.resolutions.includes(tier))),
    aspectRatios: all[0]!.aspectRatios.filter((ratio) => all.every((options) => options.aspectRatios.includes(ratio))),
    originalRatio: all.every((options) => options.originalRatio),
  }
}

export function cellCopy(values: MatrixValues, key: CellKey, templateId: string): Record<string, string> {
  return { ...(values.copy[templateId] ?? {}), ...(values.overrides[key] ?? {}) }
}

// Template-major: each template's photos in pick order. This is also the batch order (cell
// position), so the ZIP lists a template's photos together.
export function matrixCells(templates: readonly CatalogueTemplate[], photos: readonly MatrixPhoto[], values: MatrixValues): MatrixCell[] {
  const removed = new Set(values.removed)
  return templates.flatMap((template) =>
    photos.map((photo) => {
      const key = cellKey(template.id, photo.id)
      return { key, template, photo, credits: template.creditsCost[values.resolution], removed: removed.has(key), copy: cellCopy(values, key, template.id) }
    }),
  )
}

export const keptCells = (cells: readonly MatrixCell[]) => cells.filter((cell) => !cell.removed)

export const matrixTotal = (cells: readonly MatrixCell[]) => keptCells(cells).reduce((sum, cell) => sum + cell.credits, 0)

// Total credits of the kept cells at each resolution: the resolution cards show what the whole
// batch would cost there.
export function totalsByResolution(cells: readonly MatrixCell[]): Record<Resolution, number> {
  const kept = keptCells(cells)
  return Object.fromEntries(RESOLUTIONS.map((tier) => [tier, kept.reduce((sum, cell) => sum + cell.template.creditsCost[tier], 0)])) as Record<Resolution, number>
}

// The same check as the single form (workspace/copy-check): types, choices, numbers, required.
export const missingCellCopy = (cell: MatrixCell) => missingRequiredCopy(cell.template.copyFields, cell.copy)

// Why Generate is not ready, in the order the user would fix it. `ready` photos are the
// uploaded ones; the grid counts every picked photo, so the limit shows before uploads end.
export type MatrixBlock = 'templates' | 'photos' | 'empty' | 'too-many' | 'uploading' | 'copy' | 'options'

// `maxCells` is the plan's batch size (Pro 10, Max 30; feature-access batchCaps).
export function matrixBlock(cells: readonly MatrixCell[], templates: number, photos: { picked: number; uploading: boolean }, options: ImageOptions, maxCells: number): MatrixBlock | null {
  const kept = keptCells(cells)
  if (templates === 0) return 'templates'
  if (photos.picked === 0) return 'photos'
  if (kept.length === 0) return 'empty'
  if (kept.length > maxCells) return 'too-many'
  if (options.resolutions.length === 0 || (options.aspectRatios.length === 0 && !options.originalRatio)) return 'options'
  if (photos.uploading) return 'uploading'
  if (kept.some(missingCellCopy)) return 'copy'
  return null
}

// Adding and removing templates; at most the plan's number (Max five, Pro one), each once. A
// template that leaves takes its removed cells, text and toggles with it.
export function withTemplate(values: MatrixValues, templateId: string, max = MATRIX_MAX_TEMPLATES): MatrixValues {
  if (values.templateIds.includes(templateId) || values.templateIds.length >= max) return values
  return { ...values, templateIds: [...values.templateIds, templateId] }
}

export function withoutTemplate(values: MatrixValues, templateId: string): MatrixValues {
  const keep = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== templateId && !key.startsWith(`${templateId}|`)))
  return {
    ...values,
    templateIds: values.templateIds.filter((id) => id !== templateId),
    removed: values.removed.filter((key) => !key.startsWith(`${templateId}|`)),
    copy: keep(values.copy),
    overrides: keep(values.overrides) as MatrixValues['overrides'],
    toggles: keep(values.toggles),
  }
}

// A tap in the template picker: a chosen template leaves; a new one joins while there is room.
// With room for one (Pro) a new template takes the place of the one chosen before.
export function pickTemplate(values: MatrixValues, templateId: string, max: number): MatrixValues {
  if (values.templateIds.includes(templateId)) return withoutTemplate(values, templateId)
  const room = max === 1 ? values.templateIds.reduce(withoutTemplate, values) : values
  return withTemplate(room, templateId, max)
}

export function toggleCell(values: MatrixValues, key: CellKey): MatrixValues {
  const removed = values.removed.includes(key) ? values.removed.filter((current) => current !== key) : [...values.removed, key]
  return { ...values, removed }
}

// "Apply this template to more photos": the form again with only that template, its text and
// toggles kept, ready for a new set of photos.
export function onlyTemplate(values: MatrixValues, templateId: string): MatrixValues {
  return {
    ...EMPTY_MATRIX,
    resolution: values.resolution,
    aspect: values.aspect,
    templateIds: [templateId],
    copy: values.copy[templateId] ? { [templateId]: values.copy[templateId] } : {},
    toggles: values.toggles[templateId] ? { [templateId]: values.toggles[templateId] } : {},
  }
}

export const readyById = (ready: readonly ReadyPhoto[]) => new Map(ready.map((entry) => [entry.photo.id, entry]))
