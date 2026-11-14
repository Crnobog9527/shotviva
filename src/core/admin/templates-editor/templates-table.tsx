'use client'

import { providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'
import { Checkbox } from '@/core/ui/checkbox'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { AdminTemplate } from '../templates/types'
import { SortableList } from '../ui/sortable'
import { cn } from '@/core/ui/cn'

import { bulkCopy, rowCopy } from './copy'
import { stickyActionsClass } from './row-cells'
import { headerState } from './selection-state'
import { TemplateRow, type RowHandlers } from './template-row'

// Bulk selection (T60): the ticked ids and how to change them.
export type TableSelection = {
  selected: ReadonlySet<string>
  onSelect: (id: string, on: boolean) => void
  onSelectVisible: (on: boolean) => void
}

// Drag-to-reorder (T76): only on the full list, since sorting a search result would scramble
// the rows it hides.
export type TableOrder = {
  onReorder: (ids: string[]) => Promise<void>
  disabled: boolean
  disabledHint?: string
}

type Props = RowHandlers & { categoryLabels: ReadonlyMap<string, { label: string }>; templates: AdminTemplate[]; selection: TableSelection; order: TableOrder; floor: ProviderFloors }

export function TemplatesTable({ templates, selection, order, floor, categoryLabels, ...rowProps }: Props) {
  const byId = new Map(templates.map((template) => [template.id, template]))
  if (templates.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">没有匹配的模板</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              aria-label={bulkCopy.selectAll}
              title={bulkCopy.selectAll}
              checked={headerState(
                templates.map((template) => template.id),
                selection.selected,
              )}
              onCheckedChange={(checked) => selection.onSelectVisible(checked === true)}
            />
          </TableHead>
          <TableHead>排序</TableHead>
          <TableHead>名称 / ID</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>展示入口</TableHead>
          <TableHead className="h-auto py-1.5 leading-tight">
            {rowCopy.credits}
            <span className="text-muted-foreground block text-xs font-normal">{rowCopy.tiers}</span>
          </TableHead>
          <TableHead>{rowCopy.version}</TableHead>
          <TableHead>上架</TableHead>
          <TableHead>首页精选</TableHead>
          <TableHead className={cn(stickyActionsClass, 'text-right')}>操作</TableHead>
        </TableRow>
      </TableHeader>
      <SortableList
        ids={templates.map((template) => template.id)}
        labelOf={(id) => byId.get(id)?.name ?? id}
        onReorder={order.onReorder}
        disabled={order.disabled}
        disabledHint={order.disabledHint}
      >
        {(ids) => (
          <TableBody>
            {ids.map((id) => {
              const template = byId.get(id)
              if (!template) return null
              return (
                <TemplateRow
                  key={id}
                  template={template}
                  categoryLabel={categoryLabels.get(template.subcategoryKey ?? template.category)?.label ?? template.categoryInfo.nameZh}
                  price={providerFloor(floor, template.prompt?.providerId, template.id)}
                  checked={selection.selected.has(id)}
                  onSelect={selection.onSelect}
                  {...rowProps}
                />
              )
            })}
          </TableBody>
        )}
      </SortableList>
    </Table>
  )
}
