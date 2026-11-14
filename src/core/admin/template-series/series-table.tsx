'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { SortableList } from '../ui/sortable'
import { seriesCopy as copy } from './copy'
import type { SeriesListItem } from './list-rules'
import { SeriesRow, stickyActionsClass } from './series-row'

type Props = {
  ids: string[]; byId: Map<string, SeriesListItem>; visible: (id: string) => boolean; query: string; pending: boolean
  selection: { selected: Set<string>; select: (id: string, on: boolean) => void; setAll: (on: boolean) => void }
  onReorder: (ids: string[]) => Promise<void>; onDelete: (item: SeriesListItem) => void
}

// The draggable list of series not deleted, with a checkbox and 删除 on each row.
export function SeriesTable({ ids, byId, visible, query, pending, selection, onReorder, onDelete }: Props) {
  const shown = ids.filter(visible)
  const allChecked = shown.length > 0 && shown.every(id => selection.selected.has(id))
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead><Checkbox aria-label={copy.selectAll} checked={allChecked} onCheckedChange={on => selection.setAll(on === true)} /></TableHead>
        {[copy.drag, copy.cover, copy.name_zh, copy.status, copy.selectStatus].map(label => <TableHead key={label}>{label}</TableHead>)}
        <TableHead className={stickyActionsClass + ' text-right'}>{copy.actions}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        <SortableList ids={ids} labelOf={id => byId.get(id)?.name_zh ?? id} onReorder={onReorder}
          disabled={pending || !!query} disabledHint={query ? copy.dragFiltered : undefined}>
          {order => order.filter(visible).map(id => {
            const item = byId.get(id)
            return item && <SeriesRow key={id} item={item} checked={selection.selected.has(id)} pending={pending}
              onSelect={on => selection.select(id, on)} onDelete={() => onDelete(item)} />
          })}
        </SortableList>
      </TableBody>
    </Table>
  )
}
