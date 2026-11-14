'use client'

import type { useSortable } from '@dnd-kit/sortable'
import { useId, useState, type KeyboardEvent, type ReactNode, type TouchEventHandler } from 'react'

import { DragHandle, keyboardSort, sortableCopy, sortableRowClass, type Lifted } from '../sortable'
import type { TreeItem } from './tree'

type Props = {
  node: TreeItem; label: string; siblings: readonly TreeItem[]; drag: RowDrag
  disabled: boolean; onReorder: (beforeKey: string | null) => void; leading: ReactNode; children: ReactNode
}

// The tree item's sortable state; the item (row plus sub-categories) is what moves, this row holds the grip.
export type RowDrag = Pick<ReturnType<typeof useSortable>, 'setActivatorNodeRef' | 'listeners' | 'isDragging'>

// Pointer drags reorder within the sibling list (the tree slides siblings aside); keyboard moves
// (space, arrows) stay within it too.
export function TreeHandleRow({ node, label, siblings, drag, disabled, onReorder, leading, children }: Props) {
  const instructionsId = useId()
  const [lifted, setLifted] = useState<Lifted | null>(null)
  const [notice, setNotice] = useState('')
  const { setActivatorNodeRef, listeners, isDragging } = drag
  const { onTouchStart, ...handleListeners } = listeners ?? {}
  function onKeyDown(event: KeyboardEvent) {
    if (disabled) return
    const step = keyboardSort(lifted, event.key, node.key, siblings.map(item => item.key), label)
    if (!step.handled) return
    event.preventDefault()
    setLifted(step.lifted)
    if (step.announce) setNotice(step.announce)
    if (step.commit) onReorder(step.commit[step.commit.indexOf(node.key) + 1] ?? null)
  }
  const pressed = Boolean(lifted) || isDragging
  return <div onTouchStart={onTouchStart as TouchEventHandler} data-lifted={pressed || undefined}
    className={`flex flex-wrap items-center gap-1.5 py-2 ${sortableRowClass}`}>
    {leading}
    <DragHandle handle={{ ...handleListeners, ref: setActivatorNodeRef, onKeyDown, onBlur: () => setLifted(null),
      'aria-label': sortableCopy.handle(label), 'aria-describedby': instructionsId, 'aria-roledescription': sortableCopy.roleDescription,
      'aria-pressed': pressed, 'aria-disabled': disabled, title: undefined, lifted: pressed, blocked: false }} />
    {children}
    <span hidden id={instructionsId}>{sortableCopy.instructions}</span>
    <span aria-live="polite" className={lifted ? 'w-full text-xs text-muted-foreground' : 'sr-only'}>{notice}</span>
  </div>
}
