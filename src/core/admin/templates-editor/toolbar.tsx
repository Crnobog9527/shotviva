'use client'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { orderCopy } from './copy'
import type { TableOrder } from './templates-table'

type Props = { query: string; onQuery: (query: string) => void; onNew: () => void }

// Search and 新建模板 above the table. While a search is on, the table cannot be dragged
// (sorting part of the list would scramble the rows it hides), and this says so (T76).
export function Toolbar({ query, onQuery, onNew }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Input className="max-w-xs" placeholder="搜索 ID / 名称 / 分类" value={query} onChange={(event) => onQuery(event.target.value)} />
      {query.trim() ? <span className="text-muted-foreground text-xs">{orderCopy.filtered}</span> : null}
      <Button className="ml-auto" onClick={onNew}>
        新建模板
      </Button>
    </div>
  )
}

export function catalogueOrder(query: string, pending: boolean, onReorder: TableOrder['onReorder']): TableOrder {
  const filtered = query.trim() !== ''
  return { onReorder, disabled: filtered || pending, disabledHint: filtered ? orderCopy.filtered : undefined }
}
