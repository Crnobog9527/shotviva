'use client'

import { useState } from 'react'

import type { Resolution } from '@/core/templates/output-options'

import { withBatchTier, withNote, withNotes, withRemoved, withTiers } from './cell-edits'
import type { CellKey } from './matrix-state'
import type { ReviewActions } from './review-actions'
import { initiallyOpen, reviewGroups, samePhoto, sameTemplate, type GroupBy } from './review-groups'
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
  const [tierFor, setTierFor] = useState<CellKey | 'batch' | null>(null)
  const [zoomAt, setZoomAt] = useState<number | null>(null)
  const rows = groups.flatMap((group) => group.rows)
  const { change } = draft
  const actions: ReviewActions = {
    promo: draft.promo,
    editing,
    setEditing,
    setNote: (key, note) => change((v) => withNote(v, key, note)),
    copyNote: (from, to) => change((v) => withNotes(v, to, v.notes[from] ?? '', 'replace')),
    openTier: setTierFor,
    openZoom: (key) => setZoomAt(rows.findIndex((row) => row.cell.key === key)),
    siblings: (key) => ({ template: sameTemplate(draft.cells, key), photo: samePhoto(draft.cells, key) }),
  }
  const toggle = (id: string) => {
    const next = new Set(open)
    if (!next.delete(id)) next.add(id)
    setFolds({ by, open: next })
  }
  return {
    by, setBy, groups, rows, open, toggle, actions, tierFor, setTierFor, zoomAt, setZoomAt,
    allOpen: open.size > 0,
    foldAll: () => setFolds({ by, open: open.size > 0 ? new Set() : new Set(groups.map((group) => group.id)) }),
    pickTier: (key: CellKey | 'batch', tier: Resolution, alsoOthers: boolean) => {
      if (key === 'batch') return change((v) => withBatchTier(v, tier))
      change((v) => withTiers(v, alsoOthers ? sameTemplate(draft.cells, key) : [key], tier))
    },
    skip: (key: CellKey, skip: boolean) => change((v) => withRemoved(v, [key], skip)),
  }
}

export type ReviewList = ReturnType<typeof useReviewList>
