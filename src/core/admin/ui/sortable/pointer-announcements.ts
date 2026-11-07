import type { Announcements } from '@dnd-kit/core'

import { sortableCopy } from './copy'

// What a screen reader hears during a mouse or touch drag; dnd-kit's own lines are English.
export function pointerAnnouncements(order: readonly string[], labelOf: (id: string) => string): Announcements {
  const total = order.length
  const indexOf = (id: string | number) => order.indexOf(String(id))
  const label = (id: string | number) => labelOf(String(id))
  return {
    onDragStart: ({ active }) => sortableCopy.picked(label(active.id), indexOf(active.id), total),
    onDragOver: ({ active, over }) => (over ? sortableCopy.moved(label(active.id), indexOf(over.id), total) : undefined),
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? sortableCopy.dropped(label(active.id), indexOf(over.id), total)
        : sortableCopy.unchanged(label(active.id)),
    onDragCancel: ({ active }) => sortableCopy.cancelled(label(active.id), indexOf(active.id), total),
  }
}
