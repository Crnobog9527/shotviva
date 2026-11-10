'use client'

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/core/ui/cn'

export type DropPosition = { parentId: string | null; beforeKey: string | null }

export function DropTarget({ position, label }: { position: DropPosition; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: JSON.stringify(position), data: position })
  return (
    <div ref={setNodeRef} className={cn('rounded border border-dashed px-2 py-1 text-xs text-muted-foreground',
      isOver && 'border-primary bg-accent text-foreground')}>
      {label}
    </div>
  )
}
