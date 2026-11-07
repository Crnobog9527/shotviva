'use client'

import { Button } from '@/core/ui/button'

import { bulkCopy } from './copy'

type Props = { count: number; pending: boolean; onPublish: () => void; onUnpublish: () => void; onClear: () => void }

// Shows only while something is ticked (T60).
export function BulkBar({ count, pending, onPublish, onUnpublish, onClear }: Props) {
  if (count === 0) return null
  return (
    <div role="toolbar" aria-label={bulkCopy.selected(count)} className="bg-muted/60 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2">
      <span className="text-sm font-medium">{bulkCopy.selected(count)}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={onPublish}>
          {bulkCopy.publish}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onUnpublish}>
          {bulkCopy.unpublish}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onClear}>
          {bulkCopy.clear}
        </Button>
      </div>
    </div>
  )
}
