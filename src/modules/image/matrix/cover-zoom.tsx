'use client'

/* eslint-disable @next/next/no-img-element -- local photo previews and template covers */
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { coverOf } from './review-actions'
import type { ReviewRow } from './review-groups'

type Props = { rows: readonly ReviewRow[]; at: number | null; onAt(at: number | null): void }

// A larger look at a result's template next to the user's photo (Owner 2026-11-28), stepping
// through the batch's results in list order. Side by side from md; on a phone the template's
// result fills the sheet with the photo inset in its corner.
export function CoverZoom({ rows, at, onAt }: Props) {
  const t = useTranslations('app.matrix.review')
  const row = at === null ? null : rows[at]
  if (!row) return null
  const cover = coverOf(row.cell)
  const step = (by: number) => onAt((at! + by + rows.length) % rows.length)
  return (
    <ResponsiveSheet open onOpenChange={(open) => !open && onAt(null)} title={row.cell.template.name} description={t('zoomLine', { index: row.index + 1 })} nested>
      <div className="relative mt-4 md:grid md:grid-cols-[1fr_1.35fr] md:items-end md:gap-3">
        <figure className="absolute bottom-3 left-3 z-10 w-[30%] overflow-hidden rounded-[14px] shadow-[0_0_0_2px_var(--popover),0_12px_24px_-10px_#000] md:static md:w-auto md:rounded-[20px] md:shadow-[inset_0_0_0_1px_var(--border)]">
          <img src={row.photo.url} alt={t('yours')} className={`${REPLAY_BLOCK_CLASS} aspect-[4/5] w-full object-cover`} />
          <figcaption className="frost absolute bottom-1.5 left-1.5 rounded-[7px] px-1.5 py-0.5 text-caption md:bottom-2.5 md:left-2.5 md:px-2.5 md:py-1">{t('yours')}</figcaption>
        </figure>
        <figure className="relative overflow-hidden rounded-[20px] bg-muted shadow-[inset_0_0_0_1px_var(--border)]">
          {cover ? <img src={cover} alt={t('result')} className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5]" />}
          <figcaption className="absolute right-2.5 bottom-2.5 rounded-[8px] bg-primary px-2.5 py-1 text-caption font-medium text-primary-foreground md:right-auto md:left-2.5">{t('result')}</figcaption>
        </figure>
      </div>
      {rows.length > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <StepButton onClick={() => step(-1)} label={t('prev')} icon={<ChevronLeftIcon aria-hidden="true" className="size-4" />} />
          <span className="font-mono text-caption text-muted-foreground">{at! + 1} / {rows.length}</span>
          <StepButton onClick={() => step(1)} label={t('next')} icon={<ChevronRightIcon aria-hidden="true" className="size-4" />} trailing />
        </div>
      ) : null}
    </ResponsiveSheet>
  )
}

function StepButton({ onClick, label, icon, trailing = false }: { onClick(): void; label: string; icon: ReactNode; trailing?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="press hairline inline-flex h-9 items-center gap-1 rounded-full bg-wash px-3 text-caption font-medium text-bone-dim hover:text-foreground">
      {trailing ? null : icon}
      {label}
      {trailing ? icon : null}
    </button>
  )
}
