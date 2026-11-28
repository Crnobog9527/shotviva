'use client'

/* eslint-disable @next/next/no-img-element -- local photo previews and template covers */
import { ArrowRightIcon, Maximize2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { cn } from '@/core/ui/cn'

import { coverOf, type ReviewActions } from './review-actions'
import type { GroupBy, ReviewRow } from './review-groups'
import { RowNote } from './row-note'
import { TierChip } from './tier-chip'

// One result of the batch (Owner 2026-11-28): the user's photo → the template's cover (tap for a
// larger look), which photo or template it is, its tier and price, and its own note. From md the
// note sits beside the pair under the title; on a phone it runs the full width below.
export function ReviewRowView({ row, by, actions }: { row: ReviewRow; by: GroupBy; actions: ReviewActions }) {
  const t = useTranslations('app.matrix.review')
  const { cell, photo, index } = row
  const label = by === 'template' ? t('rowPhoto', { index: index + 1 }) : cell.template.name
  const sub = by === 'template' ? photo.name : cell.template.categoryName
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 px-3 py-3 md:items-start md:gap-x-3 md:gap-y-1.5">
      <div className={cn('flex items-center gap-1 md:row-span-2 md:gap-1.5', cell.removed && 'opacity-45')}>
        <img src={photo.url} alt={t('rowPhoto', { index: index + 1 })} className={cn(REPLAY_BLOCK_CLASS, 'hairline h-[52px] w-[42px] rounded-[10px] bg-muted object-cover md:h-[65px] md:w-[52px] md:rounded-[12px]')} />
        <ArrowRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <CoverButton cell={row.cell} label={t('zoom', { template: cell.template.name })} onClick={() => actions.openZoom(cell.key)} />
      </div>
      <div className={cn('min-w-0 md:flex md:min-h-10 md:items-baseline md:gap-2 md:pt-2', cell.removed && 'opacity-45')}>
        <b className="block truncate text-label leading-[1.25] font-semibold md:flex-none md:text-body">{label}</b>
        {sub ? <span className="block truncate text-caption text-muted-foreground">{sub}</span> : null}
      </div>
      <div className="md:self-start">
        <TierChip cell={cell} promo={actions.promo} onOpen={() => actions.openTier(cell.key)} />
      </div>
      <div className="col-span-3 md:col-span-2 md:col-start-2">
        {cell.removed ? <p className="py-0.5 text-caption text-muted-foreground">{t('skippedLine')}</p> : <RowNote cell={cell} actions={actions} />}
      </div>
    </li>
  )
}

function CoverButton({ cell, label, onClick }: { cell: ReviewRow['cell']; label: string; onClick(): void }) {
  const cover = coverOf(cell)
  return (
    <button type="button" onClick={onClick} aria-label={label} className="press relative block h-[52px] w-[42px] overflow-hidden rounded-[10px] bg-muted shadow-[0_0_0_1px_var(--border)] md:h-[65px] md:w-[52px] md:rounded-[12px]">
      {cover ? <img src={cover} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : null}
      <span aria-hidden="true" className="frost absolute right-1 bottom-1 grid size-5 place-items-center rounded-[6px]">
        <Maximize2Icon className="size-3" strokeWidth={2.4} />
      </span>
    </button>
  )
}
