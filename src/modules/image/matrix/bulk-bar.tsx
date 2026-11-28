'use client'

import { PencilIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

import type { ReviewList } from './use-review-list'
import type { MatrixDraft } from './use-matrix-draft'

// Under the review list while rows are picked (Owner 2026-11-28): how many, and what to do with
// them together: a tier, a note, skip (or bring back). After a change, one line says what it did
// with Undo; it stays in the list's flow at its foot, so it never covers the primary.
// `page`: on the /generate/batch page, whose Generate bar is fixed at the foot of a phone screen,
// the bar stops above it (--action-bar-h) so it stays in reach while the list scrolls.
export function BulkBar({ draft, list, page = false }: { draft: MatrixDraft; list: ReviewList; page?: boolean }) {
  const t = useTranslations('app.matrix.review')
  const { bulk } = list
  const count = bulk.selected.size
  if (count === 0) return bulk.undo ? <UndoLine list={list} /> : null
  const allSkipped = draft.cells.filter((cell) => bulk.selected.has(cell.key)).every((cell) => cell.removed)
  const mono = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>
  return (
    <div className={cn('sticky bottom-3 z-10 mt-3 grid gap-2', page && 'max-md:bottom-[calc(var(--action-bar-h,0px)+12px)]')}>
      {bulk.undo ? <UndoLine list={list} /> : null}
      <div role="toolbar" aria-label={t('selected', { count })} className="action-material flex items-center gap-1.5 rounded-[20px] py-2 pr-2 pl-4 shadow-[inset_0_0_0_1px_var(--input),0_24px_40px_-18px_#000]">
        <span className="min-w-0 flex-1 truncate text-label font-semibold">{t.rich('selected', { count, mono })}</span>
        <BarButton onClick={() => list.setTierFor('selection')}>{t('bulkTier')}</BarButton>
        <BarButton onClick={() => list.setNoteOpen(true)}>
          <PencilIcon aria-hidden="true" className="size-4 max-md:hidden" />
          {t('bulkNote')}
        </BarButton>
        <BarButton onClick={() => list.skipSelected(!allSkipped)}>{t(allSkipped ? 'bulkRestore' : 'bulkSkip')}</BarButton>
        <BarButton onClick={bulk.clear} label={t('clearSelection')}>
          <XIcon aria-hidden="true" className="size-4" />
        </BarButton>
      </div>
    </div>
  )
}

function BarButton({ onClick, label, children }: { onClick(): void; label?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="press hairline inline-flex h-10 flex-none items-center gap-1.5 rounded-[14px] bg-wash px-2.5 text-caption font-semibold whitespace-nowrap md:px-3.5 md:text-label">
      {children}
    </button>
  )
}

function UndoLine({ list }: { list: ReviewList }) {
  const t = useTranslations('app.matrix.review')
  const undo = list.bulk.undo
  if (!undo) return null
  return (
    <p role="status" className="flex items-center justify-between gap-3 rounded-full bg-foreground py-1.5 pr-1.5 pl-4 text-caption font-semibold text-background">
      {t(undo.done, { count: undo.count })}
      <button type="button" onClick={list.bulk.takeBack} className="press h-8 rounded-full bg-background/10 px-3 font-semibold">{t('undo')}</button>
    </p>
  )
}
