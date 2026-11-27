'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage) */
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { coverAvif, coverImage } from '@/core/ui/cover-image'
import { Picture } from '@/core/ui/picture'

import { COVER_SIZES } from '../catalogue/cover-sizes'
import { PairMedia } from '../catalogue/pair-media'
import type { CollectionSeries as Series } from './resolve-collection'
import { TemplateTile, type TileText } from './template-tile'

export type SeriesText = TileText & { count: string; show: string; hide: string; badge: string }

type Props = { series: Series; text: SeriesText; eager?: boolean }

// A picked series on a collection page: its cover, name and count, and its templates opening
// right here below it (Owner 2026-11-22), each with its own way in. Opened, it takes the whole
// row so its templates sit in the page's grid (collection.css, data-open).
export function CollectionSeries({ series, text, eager }: Props) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <li className="tc-series" data-open={open || undefined}>
      <div className="tc-series-card">
        <span className="tc-frame">
          <SeriesCover series={series} eager={eager} alt={`${series.name} · ${text.alt}`} />
          <Badge label={text.badge} />
        </span>
        <div className="tc-text">
          <h3 className="tc-name">{series.name}</h3>
          <p className="tc-meta">{series.categoryName} · <span className="tc-count">{text.count}</span></p>
          {series.description ? <p className="tc-desc">{series.description}</p> : null}
        </div>
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} className="tc-toggle">
          {open ? text.hide : text.show}
          <ChevronDown aria-hidden />
        </button>
      </div>
      <ul id={panel} hidden={!open} className="tc-members">
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
    const avif = coverAvif(series.cover, COVER_SIZES.cardFrame)
    return (
      <span className="tc-cover">
        <Picture avif={avif}><img {...cover} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" className="tc-cover-bg" /></Picture>
        <Picture avif={avif}><img {...cover} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className="tc-cover-img" /></Picture>
      </span>
    )
  }
  if (first) return <PairMedia before={first.cover.before as string} after={first.cover.after as string} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} />
  return <span className="tc-blank" />
}

// The catalogue's 「系列」 badge, as the public pages draw it (marketing.css .mk-sbadge), with its
// word from the page: the app badge's words are in the app's messages only.
function Badge({ label }: { label: string }) {
  return (
    <span className="mk-sbadge">
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
        <rect x="2" y="5.5" width="9" height="8" rx="1.5" />
        <path d="M5 3.5h7.5A1.5 1.5 0 0 1 14 5v6.5" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  )
}
