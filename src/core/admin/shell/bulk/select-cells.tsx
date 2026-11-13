'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { cn } from '@/core/ui/cn'

import { BULK_COPY as COPY } from './copy'
import type { RowSelection } from './use-row-selection'

// The 16px box inside a 40px label, so a press on the padding toggles it (phones). A locked row
// is greyed out with the reason as its tooltip and accessible name.
export function RowTick({ id, label, selection, locked }: { id: string; label: string; selection: RowSelection; locked?: string | null }) {
  return (
    <label className={cn('-m-3 grid size-10 place-items-center', locked ? 'cursor-not-allowed' : 'cursor-pointer')} title={locked ?? undefined}>
      <Checkbox
        aria-label={locked ? `${label}：${locked}` : `选择 ${label}`}
        disabled={!!locked}
        checked={selection.has(id)}
        onCheckedChange={() => selection.toggle(id)}
      />
    </label>
  )
}

export function AllTick({ selection, disabled }: { selection: RowSelection; disabled?: boolean }) {
  return (
    <label className="-m-3 grid size-10 cursor-pointer place-items-center" title={COPY.selectAll}>
      <Checkbox
        aria-label={COPY.selectAll}
        disabled={disabled}
        checked={selection.all ? true : selection.some ? 'indeterminate' : false}
        onCheckedChange={() => selection.toggleAll()}
      />
    </label>
  )
}
