'use client'

import { useSortable } from '@dnd-kit/sortable'
import type { CSSProperties, KeyboardEvent, TouchEventHandler } from 'react'

import { sortableCopy } from './copy'
import { useSortableListContext } from './sortable-context'

// The classes a sortable row needs: lifted look while it moves, and no text selection or iOS
// callout from the long-press on touch screens (a mouse can still select an id to copy).
export const sortableRowClass =
  'pointer-coarse:select-none [-webkit-touch-callout:none] data-[lifted]:relative data-[lifted]:z-10 data-[lifted]:bg-card data-[lifted]:shadow-lg data-[lifted]:outline data-[lifted]:outline-1 data-[lifted]:outline-primary/60'

// One row of a SortableList: spread `row` on the row element and `handle` on DragHandle.
export function useSortableItem(id: string) {
  const list = useSortableListContext()
  const label = list.labelOf(id)
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled: list.locked,
    // Under reduced motion the other rows jump to their new place instead of sliding.
    transition: list.reducedMotion ? null : undefined,
  })
  // Touch starts anywhere on the row (after the long-press delay); the mouse only on the handle.
  const { onTouchStart, ...handleListeners } = listeners ?? {}
  // dnd-kit types its listeners as bare Functions; this one is its touch activator.
  const onRowTouchStart = onTouchStart as TouchEventHandler | undefined
  const lifted = isDragging || list.liftedId === id
  const index = list.shown.indexOf(id)
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition: transition ?? undefined,
  }

  return {
    index,
    first: index === 0,
    last: index === list.shown.length - 1,
    locked: list.locked,
    row: { ref: setNodeRef, style, onTouchStart: onRowTouchStart, 'data-lifted': lifted ? '' : undefined },
    handle: {
      ref: (element: HTMLButtonElement | null) => {
        setActivatorNodeRef(element)
        list.register(id, element)
      },
      ...handleListeners,
      onKeyDown: (event: KeyboardEvent) => list.onKeyDown(id, event),
      onBlur: () => list.onBlur(id),
      'aria-label': sortableCopy.handle(label),
      'aria-roledescription': sortableCopy.roleDescription,
      'aria-describedby': list.instructionsId,
      'aria-pressed': list.liftedId === id,
      // Not `disabled`: the handle keeps focus while its own save runs.
      'aria-disabled': list.locked,
      title: list.disabled ? list.disabledHint : undefined,
      lifted,
      // Greyed only when the list cannot be dragged at all, not during the short save.
      blocked: list.disabled,
    },
    moveUp: { label: sortableCopy.moveUp(label), onClick: () => list.move(id, -1), disabled: list.locked || index === 0 },
    moveDown: {
      label: sortableCopy.moveDown(label),
      onClick: () => list.move(id, 1),
      disabled: list.locked || index === list.shown.length - 1,
    },
  }
}

export type SortableItem = ReturnType<typeof useSortableItem>
