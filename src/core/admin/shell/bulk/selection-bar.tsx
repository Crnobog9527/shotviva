'use client'

import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { BULK_COPY as COPY } from './copy'

export type BarAction = { key: string; label: string; primary?: boolean }

type Props = { count: number; pending: boolean; actions: readonly BarAction[]; onPick: (key: string) => void; onClear: () => void; idle?: ReactNode }

const ROW = 'flex min-h-12 flex-wrap items-center gap-3'

// Shows only while something is ticked (as on /admin/users). From md up it sticks to the top of
// the list while scrolling; on phones, where the buttons wrap, it floats at the bottom of the
// screen so the ticks stay reachable with a thumb.
export function SelectionBar({ count, pending, actions, onPick, onClear, idle }: Props) {
  if (count === 0) return idle ? <div className={ROW}>{idle}</div> : null
  return (
    <div
      role="toolbar"
      aria-label={COPY.selected(count)}
      className={cn(
        ROW,
        'z-20 rounded-lg border border-border bg-popover/95 px-4 py-2 shadow-lg backdrop-blur-sm',
        'max-md:fixed max-md:inset-x-3 max-md:bottom-[calc(env(safe-area-inset-bottom)+12px)] max-md:gap-2',
        'md:sticky md:top-2 md:py-1.5',
      )}
    >
      <span className="text-sm font-medium tabular-nums">{COPY.selected(count)}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.key} size="sm" variant={action.primary ? 'default' : 'outline'} disabled={pending} onClick={() => onPick(action.key)}>
            {action.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={pending} onClick={onClear}>
          {COPY.clear}
        </Button>
      </div>
    </div>
  )
}
