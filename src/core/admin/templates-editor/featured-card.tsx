'use client'

import { X } from 'lucide-react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { AdminTemplate } from '../templates/types'
import { DragHandle, MoveButtons, sortableRowClass, useSortableItem } from '../ui/sortable'
import { featuredCopy as copy } from './copy'
import { TemplateThumb } from './template-thumb'

type Props = {
  id: string
  // Missing only if the template vanished between two reads; the card still names its id.
  template: AdminTemplate | undefined
  // Place on the whole home list, 0-based: the first card is the generator's default template.
  rank: number
  pending: boolean
  onRemove: (id: string) => void
}

export const zhNameOf = (template: AdminTemplate | undefined, id: string) =>
  template?.translations.zh?.name?.trim() || template?.name || id

// One featured template as a card: its after cover, Chinese name, id. Dragged by the grip with a
// mouse, by a long-press anywhere on the card on touch screens, or from the keyboard.
export function FeaturedCard({ id, template, rank, pending, onRemove }: Props) {
  const item = useSortableItem(id)
  const name = zhNameOf(template, id)
  return (
    <li {...item.row} className={cn('bg-card grid content-start gap-2 rounded-lg border p-2', sortableRowClass)}>
      <div className="relative">
        {template ? (
          <TemplateThumb template={template} className="aspect-[4/5] w-full" px={160} />
        ) : (
          <div className="bg-muted aspect-[4/5] w-full rounded-md" />
        )}
        <span className="bg-background/85 absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums">
          {rank + 1}
          <span className="sr-only">{copy.position(rank)}</span>
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <p className="truncate text-sm font-medium" title={name}>{name}</p>
        <p className="text-muted-foreground truncate font-mono text-xs" title={id}>{id}</p>
      </div>
      <div className="-mx-0.5 flex items-center">
        <DragHandle handle={item.handle} />
        <MoveButtons item={item} axis="row" />
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive ml-auto" disabled={pending}
          aria-label={copy.remove(name)} title={copy.removeShort} onClick={() => onRemove(id)}>
          <X aria-hidden />
        </Button>
      </div>
    </li>
  )
}
