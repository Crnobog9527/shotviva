'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage),
   like the template plates */
import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'
import { coverImage } from '@/core/ui/cover-image'

import { LoopPlate } from './card-media'
import { hasStills, isMotion } from './catalogue-template'
import type { CatalogueSeries } from './catalogue-view'
import { COVER_SIZES } from './cover-sizes'
import { PairMedia } from './pair-media'

type Props = { series: CatalogueSeries; onOpen(id: string): void; eager?: boolean }

// A series card (T102): the same 8:5 frame and meta as a template card, sitting on two print
// edges that peek out below it, a small stack of prints, so a series reads as several looks
// before it is opened. The frame is the series' own artwork, or, without one, its first
// member's Phone / AI split with both tags (The Always-Visible Split Rule). A tap opens the
// series sheet to pick one.
export function SeriesCard({ series, onOpen, eager }: Props) {
  const t = useTranslations('app.series')
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t('cardAria', { name: series.name, count: series.members.length })}
      onClick={() => onOpen(series.id)}
      className="group block w-full rounded-tile text-left transition-transform duration-250 ease-house hover:-translate-y-0.5 active:scale-[.97]"
    >
      <span className="relative block">
        <PrintEdge className="inset-x-6 -bottom-[11px] bg-card" />
        <PrintEdge className="inset-x-3 -bottom-[6px] bg-muted" />
        <span className="relative block">
          <SeriesFrame series={series} eager={eager} />
        </span>
      </span>
      <span className="block pt-5">
        <span className="block text-body leading-[1.25] font-semibold tracking-[-0.015em]">{series.name}</span>
        <span className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{series.categoryName}</span>
        <span className="mt-2 inline-block rounded-tag bg-wash px-2 py-1 font-mono text-caption leading-none text-bone-dim">{t('count', { count: series.members.length })}</span>
      </span>
    </button>
  )
}

function PrintEdge({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('absolute h-4 rounded-b-control shadow-[inset_0_0_0_1px_var(--input)]', className)} />
}

function SeriesFrame({ series, eager }: { series: CatalogueSeries; eager?: boolean }) {
  const alt = useTranslations('app.series')('coverAlt', { name: series.name })
  const loading = eager ? 'eager' : 'lazy'
  if (series.cover) {
    return (
      <span className="hairline relative isolate block aspect-[8/5] overflow-hidden rounded-control bg-muted">
        <img {...coverImage(series.cover, COVER_SIZES.cardFrame)} alt={alt} loading={loading} decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.02]" />
      </span>
    )
  }
  const split = series.members.find(hasStills)
  if (split) return <PairMedia before={split.cover.before as string} after={split.cover.after as string} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} />
  const loop = series.members.find(isMotion)
  if (loop) return <LoopPlate template={loop} alt={alt} sizes={COVER_SIZES.cardFrame} />
  return <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
}
