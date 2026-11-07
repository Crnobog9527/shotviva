'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'

import type { AdminCategory } from '../template-categories/types'
import { CATEGORIES_COPY as COPY } from './copy'

type Props = {
  categories: readonly AdminCategory[]
  pending: boolean
  onMove: (index: number, direction: -1 | 1) => void
  onEdit: (category: AdminCategory) => void
  onDelete: (category: AdminCategory) => void
}

// Card style and how many templates use it.
function Tags({ category, className }: { category: AdminCategory; className: string }) {
  return (
    <div className={className}>
      <Badge variant={category.cardStyle === 'compare' ? 'default' : 'secondary'}>{COPY.style[category.cardStyle]}</Badge>
      <Badge variant="outline">{COPY.count(category.templateCount)}</Badge>
    </div>
  )
}

// One row per category in display order. From sm the order buttons lead the row and the tags
// sit by the buttons; on a phone the names and tags come first, then one line of buttons.
export function CategoryList({ categories, pending, onMove, onEdit, onDelete }: Props) {
  if (categories.length === 0) return <p className="text-sm text-muted-foreground">{COPY.empty}</p>
  return (
    <ol className="grid divide-y divide-border rounded-md border border-border">
      {categories.map((category, index) => (
        <li key={category.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
          <div className="order-first grid min-w-0 basis-full gap-0.5 sm:order-none sm:flex-1 sm:basis-auto">
            <p className="text-sm">
              <span className="font-medium">{category.nameZh}</span>
              <span className="text-muted-foreground"> · {category.nameEn}</span>
            </p>
            <p className="font-mono text-xs text-muted-foreground">{category.key}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{category.introZh ?? COPY.noIntro}</p>
            <Tags category={category} className="mt-1 flex gap-2 sm:hidden" />
          </div>
          <div className="flex gap-1 sm:order-first">
            <Button variant="ghost" size="sm" aria-label={COPY.moveUp(category.nameZh)} disabled={pending || index === 0} onClick={() => onMove(index, -1)}>
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={COPY.moveDown(category.nameZh)}
              disabled={pending || index === categories.length - 1}
              onClick={() => onMove(index, 1)}
            >
              ↓
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Tags category={category} className="hidden gap-2 sm:flex" />
            <Button variant="outline" size="sm" disabled={pending} onClick={() => onEdit(category)}>
              {COPY.edit}
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => onDelete(category)}>
              {COPY.remove}
            </Button>
          </div>
        </li>
      ))}
    </ol>
  )
}
