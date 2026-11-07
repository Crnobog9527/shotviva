'use client'

import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { SortableItem } from './use-sortable-item'

// The grip a row is dragged by (mouse) and sorted from (keyboard). Greyed while the list
// cannot be dragged; its title says why.
export function DragHandle({ handle }: { handle: SortableItem['handle'] }) {
  const { lifted, blocked, ...props } = handle
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-8 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-md outline-none focus-visible:ring-[3px] active:cursor-grabbing',
        'aria-disabled:cursor-default',
        blocked && 'hover:text-muted-foreground cursor-not-allowed opacity-35',
        lifted && 'text-primary hover:text-primary cursor-grabbing',
      )}
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  )
}

// The one-step arrows, kept small as a fallback to dragging (ARCHITECTURE §10).
export function MoveButtons({ item }: { item: Pick<SortableItem, 'moveUp' | 'moveDown'> }) {
  return (
    <span className="inline-flex">
      {[
        { ...item.moveUp, Icon: ChevronUp },
        { ...item.moveDown, Icon: ChevronDown },
      ].map(({ label, onClick, disabled, Icon }) => (
        <Button
          key={label}
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={label}
          title={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </span>
  )
}
