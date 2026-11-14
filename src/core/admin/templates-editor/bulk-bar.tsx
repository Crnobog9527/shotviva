'use client'

import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'

import { bulkCopy, bulkEditCopy, bulkFeaturedCopy, featuredCopy } from './copy'

type Props = {
  count: number
  pending: boolean
  onPublish: () => void
  onUnpublish: () => void
  // Batch edit (T79).
  onEdit: () => void
  // Batch 首页精选: true sets, false clears.
  onFeature: (featured: boolean) => void
  // 首页精选 holds an unsaved arrangement: the two 精选 buttons wait for it.
  featureLocked: boolean
  onClear: () => void
  // The second row of further actions (Owner 2026-11-14).
  more?: ReactNode
}

// Shows only while something is ticked (T60).
export function BulkBar({ count, pending, onPublish, onUnpublish, onEdit, onFeature, featureLocked, onClear, more }: Props) {
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
        <Button size="sm" variant="outline" disabled={pending} onClick={onEdit}>
          {bulkEditCopy.open}
        </Button>
        <Button size="sm" variant="outline" disabled={pending || featureLocked} title={featureLocked ? featuredCopy.locked : undefined} onClick={() => onFeature(true)}>
          {bulkFeaturedCopy.set}
        </Button>
        <Button size="sm" variant="outline" disabled={pending || featureLocked} title={featureLocked ? featuredCopy.locked : undefined} onClick={() => onFeature(false)}>
          {bulkFeaturedCopy.unset}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onClear}>
          {bulkCopy.clear}
        </Button>
      </div>
      {more ? <div className="basis-full">{more}</div> : null}
    </div>
  )
}
