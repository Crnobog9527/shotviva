'use client'

/* eslint-disable @next/next/no-img-element -- covers and local previews, not static assets */
import { useTranslations } from 'next-intl'
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import { cn } from '@/core/ui/cn'
import { coverImage } from '@/core/ui/cover-image'

import { GroundedImg, type PhotoGround } from '../result/grounded-img'
import { SplitTags } from './split-tags'

type Props = {
  before: string
  after: string
  afterAlt: string
  afterGround?: PhotoGround
  className?: string
  // On a template card a tap opens the creation dialog and only a drag compares (T38).
  onTap?(): void
  // The Art Styles grid card puts Phone / AI on the bottom corners (B comp app.css .tpl.art).
  tagsAt?: 'top' | 'bottom'
  // A template's covers: the slider's rendered width for their srcset, and lazy when it may sit
  // below the fold. Absent for a user's own photos (the result page), which load as given.
  cover?: { sizes: string; lazy?: boolean }
}

// Compare slider (DESIGN "Compare Slider", §8.3): the after plate clipped at the handle, a 2px
// white seam and a 40px frosted knob. A transparent full-surface range input gives one-finger
// drag, tap-to-jump and keyboard control. afterGround (white unless said otherwise) gives the
// after plate an opaque backdrop inside its clip, so a transparent result or cut-out cover never
// lets the before photo show through. Only a sideways drag compares: pan-y on the surface and on
// the range input hands a vertical swipe to the page or sheet scroller, and data-vaul-no-drag
// keeps the creation sheet from sliding under a sideways drag (Owner 2026-11-08, phones).
export function CompareSlider({ before, after, afterAlt, afterGround = 'white', className, onTap, tagsAt = 'top', cover }: Props) {
  const [x, setX] = useState(50)
  const t = useTranslations('app.template')
  const tap = useTap(x, setX, onTap)
  const media = (url: string) => (cover ? { ...coverImage(url, cover.sizes), loading: cover.lazy ? ('lazy' as const) : undefined } : { src: url })
  return (
    <div
      data-vaul-no-drag=""
      style={{ '--x': `${x}%` } as CSSProperties}
      className={cn('relative aspect-[4/5] touch-pan-y overflow-hidden rounded-media bg-muted select-none', className)}
    >
      <img {...media(before)} alt={t('phonePhotoAlt')} className="pointer-events-none absolute inset-0 size-full object-cover" />
      <GroundedImg {...media(after)} alt={afterAlt} ground={afterGround} className="pointer-events-none absolute inset-0 size-full object-cover [clip-path:inset(0_0_0_var(--x))]" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[var(--x)] z-2 -ml-px w-0.5 bg-photo-ink">
        <span className="frost absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--photo-ink)]">
          <svg viewBox="0 0 24 24" className="size-5 text-photo-ink" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
          </svg>
        </span>
      </span>
      <SplitTags size={tagsAt === 'top' ? 'large' : 'pair'} />
      <input
        type="range"
        min={0}
        max={100}
        value={x}
        onChange={(event) => setX(Number(event.target.value))}
        onPointerDown={tap.down}
        onPointerUp={tap.up}
        aria-label={t('compareAria')}
        className="absolute inset-0 z-4 m-0 size-full cursor-ew-resize touch-pan-y opacity-0"
      />
    </div>
  )
}

// A press that moved under 6px and lasted under 300ms is a tap: the handle goes back to where it
// was and onTap runs; anything longer is a drag.
function useTap(x: number, setX: (x: number) => void, onTap?: () => void) {
  const start = useRef<{ x: number; at: number; value: number } | null>(null)
  return {
    down: (event: PointerEvent) => {
      start.current = onTap ? { x: event.clientX, at: performance.now(), value: x } : null
    },
    up: (event: PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from || !onTap || Math.abs(event.clientX - from.x) >= 6 || performance.now() - from.at >= 300) return
      setX(from.value)
      onTap()
    },
  }
}
