'use client'

import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { USERS_COPY } from './copy'

const COPY = USERS_COPY.batch

export type BatchKind = 'adjust' | 'ban' | 'unban'

type Props = { count: number; pending: boolean; onPick: (kind: BatchKind) => void; onClear: () => void; idle: ReactNode }

const ROW = 'flex min-h-12 flex-wrap items-center gap-3'

// The buttons show only while something is ticked, as on the templates page (T60). Nothing moves
// under the pointer when the first user is ticked: from md up the bar takes the place of `idle`
// (the count line) and sticks to the top while scrolling a page of 50; on phones, where the
// buttons wrap, it floats at the bottom of the screen and the count line stays.
export function BatchBar({ count, pending, onPick, onClear, idle }: Props) {
  if (count === 0) return <div className={ROW}>{idle}</div>
  return (
    <>
      <div className={cn(ROW, 'md:hidden')}>{idle}</div>
      <Toolbar count={count} pending={pending} onPick={onPick} onClear={onClear} />
    </>
  )
}

function Toolbar({ count, pending, onPick, onClear }: Omit<Props, 'idle'>) {
  return (
    <div
      role="toolbar"
      aria-label={COPY.selected(count)}
      className={cn(
        ROW,
        'z-20 rounded-lg border border-border bg-popover/95 px-4 py-2 shadow-lg backdrop-blur-sm',
        'max-md:fixed max-md:inset-x-3 max-md:bottom-[calc(env(safe-area-inset-bottom)+12px)]',
        'md:sticky md:top-2 md:-mx-4 md:py-1.5',
      )}
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
