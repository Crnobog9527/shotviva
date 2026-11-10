'use client'

import { useDraggable } from '@dnd-kit/core'
import { useId, useState, type KeyboardEvent, type ReactNode, type TouchEventHandler } from 'react'

import { DragHandle, keyboardSort, sortableCopy, sortableRowClass, type Lifted } from '../sortable'
import type { TreeItem } from './tree'

type Props = {
  node: TreeItem; label: string; siblings: readonly TreeItem[]
  disabled: boolean; onReorder: (beforeKey: string | null) => void; children: ReactNode
}

// Keyboard moves stay within a sibling list. Pointer input uses the tree's explicit drop targets.
export function TreeHandleRow({ node, label, siblings, disabled, onReorder, children }: Props) {
  const instructionsId = useId()
  const [lifted, setLifted] = useState<Lifted | null>(null)
  const [notice, setNotice] = useState('')
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging } = useDraggable({ id: node.key, disabled })
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
  return <div ref={setNodeRef} onTouchStart={onTouchStart as TouchEventHandler} data-lifted={pressed || undefined}
    className={`flex flex-wrap items-center gap-1.5 py-2 ${sortableRowClass}`}>
    <DragHandle handle={{ ...handleListeners, ref: setActivatorNodeRef, onKeyDown, onBlur: () => setLifted(null),
      'aria-label': sortableCopy.handle(label), 'aria-describedby': instructionsId, 'aria-roledescription': sortableCopy.roleDescription,
      'aria-pressed': pressed, 'aria-disabled': disabled, title: undefined, lifted: pressed, blocked: false }} />
    {children}
    <span hidden id={instructionsId}>{sortableCopy.instructions}</span>
    <span aria-live="polite" className={lifted ? 'w-full text-xs text-muted-foreground' : 'sr-only'}>{notice}</span>
  </div>
}
