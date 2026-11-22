'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import type { OwnerConsole } from '../console/types'
import type { OwnerActions } from './actions'
import { BulkSheet } from './bulk-sheet'
import type { MemberSelection } from './member-selection'
import { FIELD } from './parts'

// Above the member list: enter / leave selection mode; while selecting, a search, a joined-from
// date and select-all (of what the filter shows).
export function BulkToolbar({ selection, disabled }: { selection: MemberSelection; disabled: boolean }) {
  const t = useTranslations('app.org.bulk')
  if (!selection.selecting) {
    return <Button type="button" size="touch" variant="glass" disabled={disabled} onClick={selection.start}>{t('select')}</Button>
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('search')}</span>
        <input className={FIELD} type="search" value={selection.filter.query} onChange={(e) => selection.setFilter({ query: e.target.value })} />
      </label>
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('joinedFrom')}</span>
        <input className={FIELD} type="date" value={selection.filter.joinedFrom} onChange={(e) => selection.setFilter({ joinedFrom: e.target.value })} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-label">
        <Checkbox checked={selection.allShown} onCheckedChange={selection.toggleAll} aria-label={t('selectAll')} />
        {t('selectAll')}
      </label>
    </div>
  )
}

// While selecting: a bar stuck to the bottom of the screen with the count, cancel and the action
// that opens the amounts sheet (a bottom drawer below 768px).
export function BulkBar({ selection, data, actions }: { selection: MemberSelection; data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.bulk')
  const [open, setOpen] = useState(false)
  if (!selection.selecting) return null
  const count = selection.selected.length
  return (
    <>
      <div data-slot="org-bulk-bar" className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-hairline bg-card px-4 py-3 pb-[calc(0.75rem+var(--sab))]">
        <span className="text-label font-medium tabular-nums">{t('selected', { count })}</span>
        <span className="flex gap-2">
          <Button type="button" size="touch" variant="glass" onClick={selection.stop}>{t('cancel')}</Button>
          <Button type="button" size="touch" disabled={count === 0} onClick={() => setOpen(true)}>{t('open')}</Button>
        </span>
      </div>
      <BulkSheet open={open} onOpenChange={setOpen} members={selection.selected} data={data} actions={actions} onDone={() => { setOpen(false); selection.clear() }} />
    </>
  )
}
