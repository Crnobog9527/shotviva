'use client'

import { useState } from 'react'

import type { Resolution } from '@/core/templates/output-options'

import type { NoteMode } from './cell-choices'
import { withBatchTier, withNote, withNotes, withRemoved, withTiers } from './cell-edits'
import type { CellKey } from './matrix-state'
import type { ReviewActions } from './review-actions'
import { initiallyOpen, reviewGroups, samePhoto, sameTemplate, tierTargets, type GroupBy } from './review-groups'
import { useBulk } from './use-bulk'
import type { MatrixDraft } from './use-matrix-draft'

// The review list's own state (Owner 2026-11-28): grouping, folds, the row being written, and
// which sheet is open. The batch's choices themselves live in the draft's values.
export function useReviewList(draft: MatrixDraft) {
  const [by, setBy] = useState<GroupBy>('template')
  const shown = draft.photos.photos.filter((photo) => photo.upload.phase !== 'error')
  const groups = reviewGroups(draft.cells, shown, by)
  const [folds, setFolds] = useState<{ by: GroupBy; open: Set<string> } | null>(null)
  // Folds start from the batch's size the first time rows show, and again per grouping.
  const open = folds?.by === by ? folds.open : initiallyOpen(groups)
  const [editing, setEditing] = useState<CellKey | null>(null)
  // Which tier sheet is open: one result's, the whole batch's, or the selection's.
  const [tierFor, setTierFor] = useState<CellKey | 'batch' | 'selection' | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const bulk = useBulk(draft)
  const [zoomAt, setZoomAt] = useState<number | null>(null)
  const rows = groups.flatMap((group) => group.rows)
  const { change } = draft
  const actions: ReviewActions = {
    promo: draft.promo,
    selected: bulk.selected,
    toggleSelect: bulk.toggle,
    editing,
    setEditing,
    setNote: (key, note) => change((v) => withNote(v, key, note)),
    copyNote: (from, to) => bulk.apply('doneCopy', to, 'notes', (v) => withNotes(v, to, v.notes[from] ?? '', 'replace')),
    openTier: setTierFor,
    openZoom: (key) => setZoomAt(rows.findIndex((row) => row.cell.key === key)),
    siblings: (key) => ({ template: sameTemplate(draft.cells, key), photo: samePhoto(draft.cells, key) }),
  }
  const toggle = (id: string) => {
    const next = new Set(open)
    if (!next.delete(id)) next.add(id)
    setFolds({ by, open: next })
  }
  const chosen = [...bulk.selected]
  return {
    by, setBy, groups, rows, open, toggle, actions, tierFor, setTierFor, zoomAt, setZoomAt, bulk, noteOpen, setNoteOpen,
    allOpen: open.size > 0,
    foldAll: () => setFolds({ by, open: open.size > 0 ? new Set() : new Set(groups.map((group) => group.id)) }),
    pickTier: (key: CellKey | 'batch' | 'selection', tier: Resolution, alsoOthers: boolean) => {
      if (key === 'batch') return change((v) => withBatchTier(v, tier))
      if (key === 'selection') return bulk.apply('doneTier', chosen, 'tiers', (v) => withTiers(v, chosen, tier))
      change((v) => withTiers(v, tierTargets(draft.cells, key, alsoOthers), tier))
    },
    skip: (key: CellKey, skip: boolean) => change((v) => withRemoved(v, [key], skip)),
    // The selection's changes, each one step to undo.
    noteSelected: (note: string, mode: NoteMode) => bulk.apply('doneNote', chosen, 'notes', (v) => withNotes(v, chosen, note, mode)),
    skipSelected: (skip: boolean) => bulk.apply(skip ? 'doneSkip' : 'doneRestore', chosen, 'removed', (v) => withRemoved(v, chosen, skip)),
  }
}

export type ReviewList = ReturnType<typeof useReviewList>
