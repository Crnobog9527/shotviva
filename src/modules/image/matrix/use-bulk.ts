'use client'

import { useEffect, useRef, useState } from 'react'

import type { CellKey, MatrixValues } from './matrix-state'
import type { MatrixDraft } from './use-matrix-draft'

export type BulkDone = 'doneNote' | 'doneTier' | 'doneSkip' | 'doneRestore' | 'doneCopy'
export type UndoOffer = { done: BulkDone; count: number; before: MatrixValues }

// How long the "done · Undo" line stays after a change to several results.
export const UNDO_MS = 6000

// The review list's selection and its one-step undo (Owner 2026-11-28): pick rows (one by one, a
// group, all), change them together, and take the change back if it hit the wrong rows.
export function useBulk(draft: MatrixDraft) {
  const [picked, setPicked] = useState<ReadonlySet<CellKey>>(new Set())
  const [undo, setUndo] = useState<UndoOffer | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  // Results that left the batch (a template or photo removed) leave the selection too.
  const live = new Set(draft.cells.map((cell) => cell.key))
  const selected = new Set([...picked].filter((key) => live.has(key)))
  const setMany = (keys: readonly CellKey[], on: boolean) => {
    const next = new Set(selected)
    for (const key of keys) if (on) next.add(key)
    else next.delete(key)
    setPicked(next)
  }
  const apply = (done: BulkDone, keys: readonly CellKey[], edit: (values: MatrixValues) => MatrixValues) => {
    const before = draft.values
    draft.change(edit)
    setUndo({ done, count: keys.length, before })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }
  return {
    selected,
    toggle: (key: CellKey) => setMany([key], !selected.has(key)),
    setMany,
    clear: () => setPicked(new Set()),
    apply,
    undo,
    takeBack: () => {
      if (!undo) return
      draft.setValues(() => undo.before)
      setUndo(null)
    },
  }
}

export type Bulk = ReturnType<typeof useBulk>
