'use client'

import { Button } from '@/core/ui/button'

import { REVIEW_COPY as COPY } from '../gallery-review/copy'
import { REVIEW_TABS, type ReviewTab } from '../gallery-review/types'

type Props = {
  tab: ReviewTab
  selected: number
  total: number
  disabled: boolean
  onSelectAll: () => void
  onBatch: (decision: 'approved' | 'rejected') => void
}

function Tabs({ tab }: { tab: ReviewTab }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={COPY.title}>
      {REVIEW_TABS.map((key) => (
        <a
          key={key}
          href={`/admin/gallery?tab=${key}`}
          aria-current={key === tab ? 'page' : undefined}
          className={`rounded-md border px-3 py-1.5 text-sm ${key === tab ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
        >
          {COPY.tabs[key]}
        </a>
      ))}
    </nav>
  )
}

// Tabs, then the batch bar: select the page, approve or reject the selection (the reason is
// asked in the confirmation).
export function ReviewToolbar({ tab, selected, total, disabled, onSelectAll, onBatch }: Props) {
  const none = selected === 0 || disabled
  return (
    <div className="grid gap-3">
      <Tabs tab={tab} />
      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button size="sm" variant="outline" onClick={onSelectAll} disabled={disabled}>
            {COPY.selectAll}
          </Button>
          <span className="text-muted-foreground">{COPY.selected(selected)}</span>
          <Button size="sm" disabled={none} onClick={() => onBatch('approved')}>
            {COPY.approveSelected}
          </Button>
          <Button size="sm" variant="outline" disabled={none} onClick={() => onBatch('rejected')}>
            {COPY.rejectSelected}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
