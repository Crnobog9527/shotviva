'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage) */
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { cn } from '@/core/ui/cn'
import { coverImage } from '@/core/ui/cover-image'

import { COVER_SIZES } from '../catalogue/cover-sizes'
import { PairMedia } from '../catalogue/pair-media'
import type { CollectionSeries as Series } from './resolve-collection'
import { TemplateTile, type TileText } from './template-tile'

export type SeriesText = TileText & { count: string; show: string; hide: string; badge: string }

type Props = { series: Series; text: SeriesText; eager?: boolean }

// A picked series on a collection page: its cover, name and count, and its templates opening
// right here below it (Owner 2026-11-22), each with its own way in. Opened, it takes the whole
// row so its templates sit in the page's grid.
export function CollectionSeries({ series, text, eager }: Props) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <li className={cn('grid content-start gap-3', open && 'md:col-span-2 lg:col-span-3')}>
      <div className={cn('grid content-start gap-3', open && 'md:max-w-[calc(50%-8px)] lg:max-w-[calc(33.333%-11px)]')}>
        <span className="relative block">
          <SeriesCover series={series} eager={eager} alt={`${series.name} · ${text.alt}`} />
          <Badge label={text.badge} />
        </span>
        <div className="grid gap-1">
          <h3 className="text-body leading-[1.25] font-semibold tracking-[-0.015em]">{series.name}</h3>
          <p className="text-caption leading-[1.35] text-muted-foreground">{series.categoryName} · <span className="font-mono">{text.count}</span></p>
          {series.description ? <p className="text-caption text-pretty text-bone-dim">{series.description}</p> : null}
        </div>
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}
          className="press hairline inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-wash px-4 text-label font-semibold">
          {open ? text.hide : text.show}
          <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      <ul id={panel} hidden={!open} className="mt-2 grid grid-cols-1 gap-x-4 gap-y-8 rounded-tile bg-card p-3 hairline md:grid-cols-2 md:p-4 lg:grid-cols-3">
        {series.members.map((member) => (
          <li key={member.id}><TemplateTile template={member} text={text} /></li>
        ))}
      </ul>
    </li>
  )
}

function SeriesCover({ series, eager, alt }: { series: Series; eager?: boolean; alt: string }) {
  const first = series.members.find((member) => member.cover.before && member.cover.after)
  if (series.cover) {
    const cover = coverImage(series.cover, COVER_SIZES.cardFrame)
    return (
      <span className="hairline relative isolate block aspect-[8/5] overflow-hidden rounded-control bg-muted">
        <img {...cover} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" />
        <img {...cover} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 size-full object-contain" />
      </span>
    )
  }
  if (first) return <PairMedia before={first.cover.before as string} after={first.cover.after as string} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} />
  return <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
}

// The catalogue's 「系列」 badge (catalogue/series-badge.tsx), with its word from the page: this
// page is public, and the badge's own words are in the app's messages only.
function Badge({ label }: { label: string }) {
  return (
    <span className="frost absolute top-2 left-2 z-5 inline-flex min-h-7 items-center gap-1.5 rounded-tag px-2.5 py-1 text-caption leading-none font-semibold text-photo-ink">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
        <rect x="2" y="5.5" width="9" height="8" rx="1.5" />
        <path d="M5 3.5h7.5A1.5 1.5 0 0 1 14 5v6.5" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  )
}
