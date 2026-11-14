'use client'

import { Button } from '@/core/ui/button'

import { bulkMoreCopy as copy } from './bulk-more-copy'
import type { BulkTasks } from './use-bulk-tasks'

// The bulk bar's second row (Owner 2026-11-14): every other change that is safe on many
// templates at once. The ones that change something open a confirm step first; 排序 and 复制 ID
// act at once (an order can be dragged back; copying changes nothing).
export function BulkMoreBar({ tasks, disabled }: { tasks: BulkTasks; disabled: boolean }) {
  const off = disabled || tasks.pending
  return (
    <div role="group" aria-label={copy.more} className="flex flex-wrap items-center gap-2 border-t pt-2">
      <span className="text-muted-foreground text-xs">{copy.more}</span>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.ask('saleOn')}>{copy.saleOn}</Button>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.ask('saleOff')}>{copy.saleOff}</Button>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.ask('seriesJoin')}>{copy.seriesJoin}</Button>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.ask('seriesLeave')}>{copy.seriesLeave}</Button>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.move(true)}>{copy.moveTop}</Button>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.move(false)}>{copy.moveBottom}</Button>
      <Button size="sm" variant="outline" disabled={off} onClick={() => tasks.ask('duplicate')}>{copy.duplicate}</Button>
      <Button size="sm" variant="outline" disabled={tasks.pending} onClick={() => void tasks.copyIds()}>{copy.copyIds}</Button>
      <Button size="sm" variant="destructive" disabled={off} onClick={() => tasks.ask('delete')}>{copy.delete}</Button>
    </div>
  )
}
