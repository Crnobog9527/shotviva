'use client'

import { Link } from '@/core/i18n/navigation'
import { Badge } from '@/core/ui/badge'
import { Checkbox } from '@/core/ui/checkbox'
import { TableCell, TableRow } from '@/core/ui/table'

import { beforeAfter, PreviewThumb } from '../ui/image-preview'
import { DragHandle, MoveButtons, sortableRowClass, useSortableItem } from '../ui/sortable'
import { seriesCopy as copy } from './copy'
import type { SeriesListItem, SeriesThumb } from './list-rules'

export const SERIES_PATH = '/admin/templates/series'

// An auto cover is a member's: its 原图 and AI 出图 side by side; a custom cover is one picture.
function thumbImages(thumb: SeriesThumb) {
  return thumb.kind === 'auto' ? beforeAfter(thumb.before, thumb.url) : [{ url: thumb.url }]
}

// One series: dragged by its handle (or long-pressed on touch); the name opens its editor dialog.
export function SeriesRow({ item, checked, onSelect }: { item: SeriesListItem; checked: boolean; onSelect: (on: boolean) => void }) {
  const sortable = useSortableItem(item.id)
  return (
    <TableRow {...sortable.row} className={sortableRowClass} data-state={checked ? 'selected' : undefined}>
      <TableCell><Checkbox aria-label={copy.selectRow(item.name_zh)} checked={checked} onCheckedChange={on => onSelect(on === true)} /></TableCell>
      <TableCell>
        <div className="flex items-center"><DragHandle handle={sortable.handle} /><MoveButtons item={sortable} /></div>
        <span className="text-muted-foreground block text-xs tabular-nums" title={copy.orderNumberHint}>{copy.orderNumber(item.sort_order)}</span>
      </TableCell>
      <TableCell>
        <div className="flex w-max items-center gap-2">
          {item.thumb
            ? <PreviewThumb title={item.name_zh} images={thumbImages(item.thumb)}>
              {/* The same public still the card shows; admin-only page, so a plain img is fine. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.thumb.url} alt="" width={40} height={50} loading="lazy" className="bg-muted h-12 w-10 rounded object-cover" />
            </PreviewThumb>
            : <span className="bg-muted text-muted-foreground grid h-12 w-10 place-items-center rounded text-[10px]">{copy.noCover}</span>}
          <div className="grid justify-items-start gap-1">
            {item.thumb && <Badge variant="outline">{item.thumb.kind === 'custom' ? copy.coverCustom : copy.coverAuto}</Badge>}
            <Link href={`${SERIES_PATH}?cover=${item.id}`} scroll={false} className="text-xs underline underline-offset-2">{copy.changeCover}</Link>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Link href={`${SERIES_PATH}?id=${item.id}`} scroll={false} className="font-medium underline">{item.name_zh}</Link>
        <span className="text-muted-foreground block text-xs">{item.slug}</span>
      </TableCell>
      <TableCell>{item.is_active ? copy.published : copy.unpublished}</TableCell>
      <TableCell>{item.show_members ? copy.separate : copy.onlySeries}</TableCell>
    </TableRow>
  )
}
