'use client'

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useId, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useMediaQuery } from '@/core/ui/use-media-query'

import { sortableCopy } from './copy'
import { moveTo } from './keyboard-sort'
import { pointerAnnouncements } from './pointer-announcements'
import { SortableListContext } from './sortable-context'
import { useSortableList, type SortableListOptions } from './use-sortable-list'

type Props = Omit<SortableListOptions, 'disabled'> & {
  disabled?: boolean
  // Shown on the greyed handles, e.g. why the list cannot be dragged right now.
  disabledHint?: string
  // Renders the rows in the order to show; each row calls useSortableItem(id).
  children: (ids: string[]) => ReactNode
}

// Rows only move up and down.
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const noSubscribe = () => () => {}

// Drag-to-reorder for admin lists (ARCHITECTURE §10 「拖动排序」): the handle with a mouse, a
// ~0.3 s long-press anywhere on the row on touch screens, the keyboard on the focused handle.
// Near the edges the page scrolls along (dnd-kit autoScroll). Renders no element of its own,
// so it can sit inside a <table>; its screen-reader text goes to <body>.
export function SortableList({ ids, labelOf, onReorder, disabled = false, disabledHint, children }: Props) {
  const state = useSortableList({ ids, labelOf, onReorder, disabled })
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const dndId = useId()
  const instructionsId = useId()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  )

  const onDragStart = ({ activatorEvent }: DragStartEvent) => {
    state.cancelKeyboard()
    // A short buzz where the phone supports it, so a long-press feels picked up.
    if (typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent) navigator.vibrate?.(10)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || over.id === active.id) return
    const from = state.shown.indexOf(String(active.id))
    const to = state.shown.indexOf(String(over.id))
    if (from >= 0 && to >= 0) state.commit(moveTo(state.shown, from, to))
  }

  return (
    <SortableListContext value={{ ...state, labelOf, instructionsId, disabledHint, reducedMotion }}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        accessibility={{
          // dnd-kit's own hidden text would otherwise render inside the <table>.
          container: mounted ? document.body : undefined,
          announcements: pointerAnnouncements(state.shown, labelOf),
          screenReaderInstructions: { draggable: sortableCopy.instructions },
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={state.shown} strategy={verticalListSortingStrategy} disabled={state.locked}>
          {children(state.shown)}
        </SortableContext>
      </DndContext>
      {mounted
        ? createPortal(
            <>
              <p id={instructionsId} hidden>
                {sortableCopy.instructions}
              </p>
              <p aria-live="assertive" aria-atomic="true" className="sr-only">
                {state.announcement}
              </p>
            </>,
            document.body,
          )
        : null}
    </SortableListContext>
  )
}
