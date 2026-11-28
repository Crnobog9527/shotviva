import type { Resolution } from '@/core/templates/output-options'
import { RESOLUTIONS } from '@/core/templates/output-options'

import type { BatchPhoto } from '../workspace/photo-batch'
import type { CellKey, MatrixCell } from './matrix-state'

// The review list before Generate (Owner 2026-11-28): one row per result, grouped by template
// (each template's photos) or by photo (each photo's templates). Groups fold, so five templates
// over 30 photos never make one endless list.
export type GroupBy = 'template' | 'photo'

export type ReviewRow = { cell: MatrixCell; photo: BatchPhoto; index: number }
export type ReviewGroup = { id: string; by: GroupBy; rows: ReviewRow[] }

export function reviewGroups(cells: readonly MatrixCell[], photos: readonly BatchPhoto[], by: GroupBy): ReviewGroup[] {
  const index = new Map(photos.map((photo, i) => [photo.id, i]))
  const rows = cells.flatMap((cell) => {
    const at = index.get(cell.photo.id)
    return at === undefined ? [] : [{ cell, photo: photos[at]!, index: at }]
  })
  const groupOf = (row: ReviewRow) => (by === 'template' ? row.cell.template.id : row.photo.id)
  const order = by === 'template' ? [...new Set(rows.map(groupOf))] : photos.map((photo) => photo.id)
  return order.flatMap((id) => {
    const members = rows.filter((row) => groupOf(row) === id)
    return members.length ? [{ id, by, rows: members }] : []
  })
}

export type GroupSummary = { kept: number; tiers: [Resolution, number][]; notes: number; credits: number }

// What a folded group says about itself: how many it makes, at which tiers, how many carry a
// note, and what it costs.
export function groupSummary(group: ReviewGroup): GroupSummary {
  const kept = group.rows.filter((row) => !row.cell.removed)
  const counts = new Map<Resolution, number>()
  for (const { cell } of kept) if (cell.tier) counts.set(cell.tier, (counts.get(cell.tier) ?? 0) + 1)
  return {
    kept: kept.length,
    tiers: RESOLUTIONS.flatMap((tier) => (counts.has(tier) ? [[tier, counts.get(tier)!] as [Resolution, number]] : [])),
    notes: group.rows.filter((row) => row.cell.note.trim()).length,
    credits: kept.reduce((sum, row) => sum + row.cell.credits, 0),
  }
}

// Which groups start open: all of them while the whole batch is short enough to scan, else only
// the first, so the list opens on a page of group heads rather than a wall of rows.
export const OPEN_ALL_UP_TO = 10
export function initiallyOpen(groups: readonly ReviewGroup[]): Set<string> {
  const rows = groups.reduce((sum, group) => sum + group.rows.length, 0)
  return new Set(rows <= OPEN_ALL_UP_TO ? groups.map((group) => group.id) : groups.slice(0, 1).map((group) => group.id))
}

// Results that share a template, or a photo, with `key`: the "also apply to" shortcuts.
export function sameTemplate(cells: readonly MatrixCell[], key: CellKey): CellKey[] {
  const id = cells.find((cell) => cell.key === key)?.template.id
  return cells.filter((cell) => cell.template.id === id && !cell.removed).map((cell) => cell.key)
}
export function samePhoto(cells: readonly MatrixCell[], key: CellKey): CellKey[] {
  const id = cells.find((cell) => cell.key === key)?.photo.id
  return cells.filter((cell) => cell.photo.id === id && !cell.removed).map((cell) => cell.key)
}
