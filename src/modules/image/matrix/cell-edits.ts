import type { Resolution } from '@/core/templates/output-options'

import { cleanNote, mergedNote, type NoteMode } from './cell-choices'
import type { CellKey, MatrixValues } from './matrix-state'

// Edits to individual results of a batch (Owner 2026-11-28): one row, a group, a selection.
// Each touches only the keys given, so editing one result never wipes another.

// The whole batch on one tier: every result's own pick is dropped, the default moves.
export const withBatchTier = (values: MatrixValues, tier: Resolution): MatrixValues => ({ ...values, resolution: tier, tiers: {} })

export function withTiers(values: MatrixValues, keys: readonly CellKey[], tier: Resolution): MatrixValues {
  const tiers = { ...values.tiers }
  for (const key of keys) tiers[key] = tier
  return { ...values, tiers }
}

// One result's own note, as typed (trimmed when sent); empty removes it.
export function withNote(values: MatrixValues, key: CellKey, note: string): MatrixValues {
  const notes = { ...values.notes }
  if (note) notes[key] = note
  else delete notes[key]
  return { ...values, notes }
}

export function withNotes(values: MatrixValues, keys: readonly CellKey[], note: string, mode: NoteMode): MatrixValues {
  return keys.reduce((current, key) => withNote(current, key, mergedNote(current.notes[key] ?? '', note, mode)), values)
}

// Leaving out (or bringing back) several results at once; a left-out result keeps its note and
// tier for when it comes back.
export function withRemoved(values: MatrixValues, keys: readonly CellKey[], removed: boolean): MatrixValues {
  const rest = values.removed.filter((key) => !keys.includes(key))
  return { ...values, removed: removed ? [...rest, ...keys] : rest }
}

// The note a result sends: blank is none, so the job looks as it did before notes.
export const sentNote = (note: string) => cleanNote(note) || undefined

// One bulk change, for its undo: the field it touched and what each touched result had there
// before. Undo puts back only that, so edits made since (another row's note, the same rows' other
// fields) stay.
export type CellField = 'tiers' | 'notes' | 'removed'
export type CellSnapshot = { field: CellField; before: [CellKey, string | boolean | undefined][] }

export function snapshotCells(values: MatrixValues, keys: readonly CellKey[], field: CellField): CellSnapshot {
  const removed = new Set(values.removed)
  const at = (key: CellKey) => (field === 'removed' ? removed.has(key) : field === 'tiers' ? values.tiers[key] : values.notes[key])
  return { field, before: keys.map((key) => [key, at(key)]) }
}

export function restoreCells(values: MatrixValues, snapshot: CellSnapshot): MatrixValues {
  if (snapshot.field === 'removed') {
    const back = snapshot.before.filter(([, was]) => was === true).map(([key]) => key)
    const keep = snapshot.before.filter(([, was]) => was !== true).map(([key]) => key)
    return withRemoved(withRemoved(values, keep, false), back, true)
  }
  const record = { ...values[snapshot.field] } as Record<CellKey, string>
  for (const [key, was] of snapshot.before) {
    if (was === undefined) delete record[key]
    else record[key] = was as string
  }
  return { ...values, [snapshot.field]: record }
}
