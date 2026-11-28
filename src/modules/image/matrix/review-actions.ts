import type { CellKey, MatrixCell } from './matrix-state'

// What a row can do, handed down from the review list so each row stays a plain view.
export type ReviewActions = {
  promo: boolean
  selected: ReadonlySet<CellKey>
  toggleSelect(key: CellKey): void
  editing: CellKey | null
  setEditing(key: CellKey | null): void
  setNote(key: CellKey, note: string): void
  // Copy one result's note to others (the "also use for" shortcuts), replacing theirs.
  copyNote(from: CellKey, to: readonly CellKey[]): void
  openTier(key: CellKey): void
  openZoom(key: CellKey): void
  // Same template / same photo as this result, for the shortcuts' counts.
  siblings(key: CellKey): { template: CellKey[]; photo: CellKey[] }
}

export const coverOf = (cell: MatrixCell) => cell.template.cover.after ?? cell.template.cover.poster ?? null
