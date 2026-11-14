import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { DeletedSeries } from './batch'
import { seriesCopy as copy } from './copy'

const when = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })

// 已删除 (1500): read only. A deleted series cannot be restored, published, ordered or given members.
export function DeletedSeriesList({ items }: { items: DeletedSeries[] }) {
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm">{copy.deletedHint}</p>
      {items.length ? (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{copy.name_zh}</TableHead><TableHead>{copy.deletedAt}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell><span className="font-medium">{item.name_zh}</span><span className="text-muted-foreground block text-xs">{item.slug}</span></TableCell>
                <TableCell className="tabular-nums">{when.format(new Date(item.deleted_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : <p className="text-muted-foreground text-sm">{copy.noDeleted}</p>}
    </div>
  )
}
