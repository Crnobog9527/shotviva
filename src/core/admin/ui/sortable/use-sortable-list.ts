'use client'

import { useLayoutEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from 'react'

import { cancelLift, keyboardSort, moveTo, type Lifted } from './keyboard-sort'

export type SortableListOptions = {
  // The order the server has; the list shows its own optimistic order while a save runs.
  ids: string[]
  labelOf: (id: string) => string
  // Saves the whole new order and reports the outcome itself; it must not throw. When the
  // server's `ids` do not change (a failed save), the list falls back to them on its own.
  onReorder: (ids: string[]) => Promise<void>
  disabled: boolean
}

// Each row's handle, so a keyboard move can put focus back on the row it moved. React moves
// the focused handle's row in the DOM, which can drop focus; while a move is expected the blur
// that caused is not taken as leaving the list.
function useHandleFocus() {
  const handles = useRef(new Map<string, HTMLElement>())
  const refocus = useRef<string | null>(null)

  useLayoutEffect(() => {
    const id = refocus.current
    if (!id) return
    refocus.current = null
    const handle = handles.current.get(id)
    if (!handle) return
    if (document.activeElement !== handle) handle.focus({ preventScroll: true })
    handle.scrollIntoView({ block: 'nearest' })
  })

  const register = (id: string, element: HTMLElement | null) => {
    if (element) handles.current.set(id, element)
    else handles.current.delete(id)
  }
  return {
    register,
    // Called before a keyboard move re-renders the rows.
    expectMove: (id: string) => {
      refocus.current = id
    },
    moving: () => refocus.current !== null,
  }
}

// State behind SortableList: the optimistic order, the keyboard lift, the screen-reader line.
export function useSortableList({ ids, labelOf, onReorder, disabled }: SortableListOptions) {
  const [order, setOptimistic] = useOptimistic(ids)
  const [saving, startSaving] = useTransition()
  const [lifted, setLifted] = useState<Lifted | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { register, expectMove, moving } = useHandleFocus()
  const shown = lifted?.order ?? order
  const locked = disabled || saving

  const commit = (next: string[]) =>
    startSaving(async () => {
      setOptimistic(next)
      await onReorder(next)
    })

  const onKeyDown = (id: string, event: KeyboardEvent) => {
    if (locked && !lifted) return
    const step = keyboardSort(lifted, event.key, id, shown, labelOf(id))
    if (!step.handled) return
    event.preventDefault()
    if (step.announce) setAnnouncement(step.announce)
    if (step.lifted && step.lifted.order !== lifted?.order) expectMove(id)
    setLifted(step.lifted)
    if (step.commit) commit(step.commit)
  }

  const onBlur = (id: string) => {
    if (moving() || !lifted || lifted.id !== id) return
    setAnnouncement(cancelLift(lifted, labelOf(id)).announce ?? '')
    setLifted(null)
  }

  // The arrow buttons: one step, saved the same way as a drop.
  const move = (id: string, by: -1 | 1) => {
    const from = shown.indexOf(id)
    const to = from + by
    if (locked || from < 0 || to < 0 || to >= shown.length) return
    commit(moveTo(shown, from, to))
  }

  return {
    shown,
    disabled,
    locked,
    liftedId: lifted?.id ?? null,
    announcement,
    cancelKeyboard: () => setLifted(null),
    commit,
    onKeyDown,
    onBlur,
    move,
    register,
  }
}

export type SortableListState = ReturnType<typeof useSortableList>
