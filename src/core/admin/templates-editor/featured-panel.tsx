'use client'

import { DragHandle, MoveButtons, SortableList, sortableRowClass, useSortableItem } from '../ui/sortable'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { AdminTemplate } from '../templates/types'
import { orderCopy } from './copy'
import { FEATURED_LIMIT } from './featured-state'

type Props = {
  ids: string[]
  templates: AdminTemplate[]
  pending: boolean
  // Drag, keyboard or arrows (T76): the whole new order, saved optimistically.
  onReorder: (ids: string[]) => Promise<void>
  onRemove: (id: string) => void
}

// 首页精选 (T53): the home page's featured templates in display order; the switch in the table
// adds or removes one, this list orders them. With none chosen, the home page shows the six
// most recently published.
export function FeaturedPanel({ ids, templates, pending, onReorder, onRemove }: Props) {
  const nameOf = (id: string) => templates.find((template) => template.id === id)?.name ?? id
  return (
    <section aria-labelledby="featured-h" className="rounded-md border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="featured-h" className="font-medium">
          首页精选
        </h2>
        <span className="text-muted-foreground text-sm">
          {ids.length} / {FEATURED_LIMIT}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        首页和落地页的模板区按分类显示这里的模板，顺序即同一分类内的先后，第一个也是首页生成栏默认选中的模板。只能选已上架、站内可见的模板。一个都不选时显示最新上架的 6 个。
      </p>
      {ids.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">还没有精选模板，在下表「首页精选」一列打开。</p>
      ) : (
        <>
          <p className="text-muted-foreground mt-1 text-sm">{orderCopy.dragHint}</p>
          <SortableList ids={ids} labelOf={nameOf} onReorder={onReorder} disabled={pending}>
            {(order) => (
              <ol className="mt-3 grid grid-cols-1 gap-1">
                {order.map((id) => (
                  <FeaturedRow key={id} id={id} name={nameOf(id)} pending={pending} onRemove={onRemove} />
                ))}
              </ol>
            )}
          </SortableList>
        </>
      )}
    </section>
  )
}

function FeaturedRow({ id, name, pending, onRemove }: { id: string; name: string; pending: boolean; onRemove: (id: string) => void }) {
  const item = useSortableItem(id)
  return (
    <li {...item.row} className={cn('flex min-h-10 items-center gap-2 rounded-md pr-1 text-sm', sortableRowClass)}>
      <DragHandle handle={item.handle} />
      <span className="text-muted-foreground w-6 font-mono tabular-nums">{item.index + 1}</span>
      <span className="min-w-0 flex-1 truncate">
        {name} <span className="text-muted-foreground font-mono text-xs max-sm:hidden">{id}</span>
      </span>
      <MoveButtons item={item} />
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRemove(id)}>
        移出
      </Button>
    </li>
  )
}
