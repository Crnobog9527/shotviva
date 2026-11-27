'use client'

import { X } from 'lucide-react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { DragHandle, MoveButtons, sortableRowClass, useSortableItem } from '../ui/sortable'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'

type RowProps = { id: string; name: string; detail?: string; onRemove?: () => void; removeLabel?: string }

const Label = ({ name, detail }: { name: string; detail?: string }) => (
  <span className="min-w-0 flex-1 truncate text-sm">{name}{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}</span>
)

// A row in edit mode: dragged or moved with the arrows inside a SortableList.
export function SortableRow({ id, name, detail, onRemove, removeLabel }: RowProps) {
  const item = useSortableItem(id)
  return (
    <li {...item.row} className={cn('flex items-center gap-1 rounded-md border bg-card px-1 py-0.5', sortableRowClass)}>
      <DragHandle handle={item.handle} />
      <Label name={name} detail={detail} />
      <MoveButtons item={item} axis="column" />
      {onRemove ? (
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive"
          aria-label={removeLabel} onClick={onRemove}><X aria-hidden /></Button>
      ) : null}
    </li>
  )
}

// A row in the read view: its position and name, nothing to grab.
export function StaticRow({ position, name, detail }: { position: number; name: string; detail?: string }) {
  return (
    <li className="flex items-center gap-2 rounded-md border px-3 py-1.5">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{position}</span>
      <Label name={name} detail={detail} />
    </li>
  )
}

export function OwnBadge({ own }: { own: boolean }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-xs', own ? 'border-primary/50 text-primary' : 'text-muted-foreground')}>
      {own ? COPY.own : COPY.following}
    </span>
  )
}
