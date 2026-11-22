'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage),
   like the template plates */
import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'
import { coverAvif, coverImage } from '@/core/ui/cover-image'
import { Picture } from '@/core/ui/picture'

import { LoopPlate } from './card-media'
import { hasStills, isMotion, pairedMember } from './catalogue-template'
import type { CatalogueSeries } from './catalogue-view'
import { COVER_SIZES } from './cover-sizes'
import { PairMedia } from './pair-media'
import { SeriesBadge } from './series-badge'
import { PickMark } from '../template-share/pick-mark'

type Props = { series: CatalogueSeries; onOpen(id: string): void; eager?: boolean }

// A series card (T102): the same 8:5 frame and meta as a template card, on two prints stacked
// behind it whose corners show past its own, plus a 「系列」 badge on the picture,
// so a series is told from a single template at a glance (Owner 2026-11-12). The frame is the
// series' own artwork, or, without one, its first member's Phone / AI split with both tags (The
// Always-Visible Split Rule). A tap opens the series panel (its members and the chosen one's
// form, one step). No save heart: favourites are per template.
export function SeriesCard({ series, onOpen, eager }: Props) {
  const t = useTranslations('app.series')
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t('cardAria', { name: series.name, count: series.members.length })}
      onClick={() => onOpen(series.id)}
      className="group relative block w-full rounded-tile text-left transition-transform duration-250 ease-house hover:-translate-y-0.5 active:scale-[.97]"
    >
      <PickMark item={{ type: 'series', id: series.id }} />
      <span className="relative block">
        <PrintEdge className="translate-x-[3px] translate-y-[5px] rotate-[2.8deg] bg-secondary" />
        <PrintEdge className="-translate-x-[2px] translate-y-[2px] -rotate-[2deg] bg-accent" />
        <span className="relative block rounded-control shadow-[0_6px_16px_-8px_rgba(0,0,0,.75)]">
          <SeriesFrame series={series} eager={eager} />
          <SeriesBadge className="absolute top-2 left-2 z-5" />
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

// A print behind the frame, the frame's size, turned a couple of degrees so its corners show
// past the frame's (a few px, inside the grid gap); lighter than the page so they read in the
// dark, the one further back a step darker. Still
// prints under reduced motion: nothing here moves. The public pages copy these values
// (core/content/blocks/series-card.tsx, marketing.css .mk-sprint*): change both together.
function PrintEdge({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('absolute inset-0 rounded-control shadow-[inset_0_0_0_1px_var(--input)]', className)} />
}

function SeriesFrame({ series, eager }: { series: CatalogueSeries; eager?: boolean }) {
  const alt = useTranslations('app.series')('coverAlt', { name: series.name })
  const loading = eager ? 'eager' : 'lazy'
  if (series.cover) {
    // The artwork is one member's after cover: show it as that member's Phone / AI split, so the
    // card tells the difference at a glance, like a series without artwork (Owner 2026-11-16).
    const paired = pairedMember(series.cover, series.members)
    if (paired) return <PairMedia before={paired.cover.before as string} after={series.cover} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} />
    // The whole artwork, never cropped to the 8:5 frame (Owner 2026-11-13: 画风迁移 lost heads and
    // hands): it is contained, and the same picture, blurred and dimmed, fills the bands a cover
    // of another shape leaves. One download: both use the same srcset.
    const cover = coverImage(series.cover, COVER_SIZES.cardFrame)
    const avif = coverAvif(series.cover, COVER_SIZES.cardFrame)
    return (
      <span className="hairline relative isolate block aspect-[8/5] overflow-hidden rounded-control bg-muted">
        <Picture avif={avif}><img {...cover} alt="" aria-hidden="true" loading={loading} decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" /></Picture>
        <Picture avif={avif}><img {...cover} alt={alt} loading={loading} decoding="async" className="absolute inset-0 size-full object-contain" /></Picture>
      </span>
    )
  }
  const split = series.members.find(hasStills)
  if (split) return <PairMedia before={split.cover.before as string} after={split.cover.after as string} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} />
  const loop = series.members.find(isMotion)
  if (loop) return <LoopPlate template={loop} alt={alt} sizes={COVER_SIZES.cardFrame} />
  return <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
}
