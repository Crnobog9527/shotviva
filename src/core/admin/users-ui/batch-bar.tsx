'use client'

import { Button } from '@/core/ui/button'

import { USERS_COPY } from './copy'

const COPY = USERS_COPY.batch

export type BatchKind = 'adjust' | 'ban' | 'unban'

type Props = { count: number; pending: boolean; onPick: (kind: BatchKind) => void; onClear: () => void }

// Shows only while something is ticked, as on the templates page (T60). Sticky, so it stays in
// reach while scrolling a page of 50.
export function BatchBar({ count, pending, onPick, onClear }: Props) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label={COPY.selected(count)}
      className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-popover/95 px-4 py-2 shadow-lg backdrop-blur-sm"
    >
      <span className="text-sm font-medium tabular-nums">{COPY.selected(count)}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => onPick('adjust')}>
          {COPY.adjust}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onPick('ban')}>
          {COPY.ban}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onPick('unban')}>
          {COPY.unban}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onClear}>
          {COPY.clear}
        </Button>
      </div>
    </div>
  )
}
