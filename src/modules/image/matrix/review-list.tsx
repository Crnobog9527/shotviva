'use client'

import { ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

import { BulkBar } from './bulk-bar'
import { poolTotals } from './cell-choices'
import { CheckBox, pressedOf } from './check-box'
import { keptCells } from './matrix-state'
import { ReviewGroupView } from './review-group'
import type { GroupBy } from './review-groups'
import { ReviewSheets } from './review-sheets'
import { useReviewList, type ReviewList } from './use-review-list'
import type { MatrixDraft } from './use-matrix-draft'

// 出图前核对一下 (Owner 2026-11-28): the batch as a list, one row per result, in place of the
// photo × template grid. What it will spend from each pool and the whole batch's tier sit on top;
// below, the grouping, folding all, and the groups.
export function ReviewListView({ draft, page = false }: { draft: MatrixDraft; page?: boolean }) {
  const list = useReviewList(draft)
  return (
    <div>
      <ReviewSummary draft={draft} list={list} />
      <div className="mt-3 mb-1 flex items-center justify-between gap-2">
        <GroupSwitch by={list.by} onBy={list.setBy} />
        <span className="flex items-center">
          <FoldAll open={list.allOpen} onClick={list.foldAll} />
          <SelectAll draft={draft} list={list} />
        </span>
      </div>
      <div className="grid gap-2.5">
        {list.groups.map((group) => (
          <ReviewGroupView
            key={`${group.by}-${group.id}`}
            group={group}
            open={list.open.has(group.id)}
            onToggle={() => list.toggle(group.id)}
            onSelect={(on) => list.bulk.setMany(group.rows.map((row) => row.cell.key), on)}
            actions={list.actions}
          />
        ))}
      </div>
      <BulkBar draft={draft} list={list} page={page} />
      <ReviewSheets draft={draft} list={list} />
    </div>
  )
}

function ReviewSummary({ draft, list }: { draft: MatrixDraft; list: ReviewList }) {
  const t = useTranslations('app.matrix.review')
  const need = poolTotals(draft.cells)
  const b = (chunks: ReactNode) => <b className="font-mono font-medium text-foreground">{chunks}</b>
  const kept = keptCells(draft.cells)
  const tiers = new Set(kept.map((cell) => cell.tier))
  const single = tiers.size === 1 ? [...tiers][0] : null
  return (
    <div className="hairline-lit flex flex-col gap-2.5 rounded-panel bg-card p-3 md:flex-row md:items-center md:pl-4">
      <p className="min-w-0 flex-1 text-caption text-muted-foreground">
        <span className="block md:inline">{t.rich(draft.promo ? 'orgPaidLine' : 'paidLine', { b, need: need.paid, left: draft.balance.paid })}</span>
        <span className="max-md:hidden"> · </span>
        <span className="block md:inline">{draft.promo ? t.rich('promoLine', { b, need: need.free, left: draft.balance.free }) : t('paidOnly')}</span>
      </p>
      {draft.options.resolutions.length > 1 && kept.length > 0 ? (
        <button type="button" onClick={() => list.setTierFor('batch')} className="press hairline inline-flex h-10 items-center justify-between gap-2 rounded-[14px] bg-wash pr-3 pl-3.5 text-caption font-semibold whitespace-nowrap">
          {t('batchTier')}
          <span className="font-normal text-bone-dim">{single ? single.toUpperCase() : t('mixed')}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function GroupSwitch({ by, onBy }: { by: GroupBy; onBy(by: GroupBy): void }) {
  const t = useTranslations('app.matrix')
  return (
    <div role="group" aria-label={t('review.groupBy')} className="hairline inline-flex flex-none rounded-full bg-wash p-1">
      {(['template', 'photo'] as const).map((key) => (
        <button key={key} type="button" aria-pressed={by === key} onClick={() => onBy(key)} className={cn('h-8 rounded-full px-3 text-caption font-medium md:px-3.5', by === key ? 'bg-foreground text-background' : 'text-bone-dim')}>
          {t(key === 'template' ? 'byTemplate' : 'byPhoto')}
        </button>
      ))}
    </div>
  )
}

function SelectAll({ draft, list }: { draft: MatrixDraft; list: ReviewList }) {
  const t = useTranslations('app.matrix.review')
  const keys = draft.cells.map((cell) => cell.key)
  const picked = list.bulk.selected.size
  const state = picked === 0 ? 'off' : picked === keys.length ? 'on' : 'some'
  return (
    <button type="button" aria-pressed={pressedOf(state)} onClick={() => (state === 'on' ? list.bulk.clear() : list.bulk.setMany(keys, true))} className="inline-flex min-h-11 items-center gap-2 px-2 text-caption font-medium whitespace-nowrap text-bone-dim hover:text-foreground">
      <CheckBox state={state} />
      {t('selectAll')}
    </button>
  )
}

function FoldAll({ open, onClick }: { open: boolean; onClick(): void }) {
  const t = useTranslations('app.matrix.review')
  const Icon = open ? ChevronsDownUpIcon : ChevronsUpDownIcon
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-caption font-medium whitespace-nowrap text-bone-dim hover:text-foreground">
      <Icon aria-hidden="true" className="size-4" />
      {t(open ? 'foldAll' : 'openAll')}
    </button>
  )
}
