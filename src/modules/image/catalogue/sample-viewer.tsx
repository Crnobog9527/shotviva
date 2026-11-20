'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage) */
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, useState } from 'react'

import { coverImage } from '@/core/ui/cover-image'

import { CloseMark, SideToggle, useSwipe, type ViewerSide } from './sample-viewer-parts'
import { useBackToClose } from './use-back-to-close'

export type { ViewerSide } from './sample-viewer-parts'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  before: string
  after: string
  name: string
  side: ViewerSide
  onSide(side: ViewerSide): void
}

type Box = { width: number; height: number }

// One-off values as inline styles, so the public pages' sheet stays small (scripts/public-css-check.ts).
// Above the creation sheets (z-index 100). The scrim is DESIGN.md's sheet scrim (black 62%, 2px
// blur), so the dialog stays faintly visible behind the picture.
const LAYER = { zIndex: 110 } as const
const SCRIM = { ...LAYER, background: 'rgb(0 0 0 / 0.62)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' } as const
// The picture fits the screen with a margin on every side and room for the hint line below it.
const GUTTER = 'clamp(12px, 4vw, 48px)'
const FIT = {
  cursor: 'zoom-in',
  maxWidth: `calc(100vw - 2 * ${GUTTER})`,
  maxHeight: `calc(100dvh - var(--sat) - var(--sab) - 2 * ${GUTTER} - 2.75rem)`,
} as const
const PAN = { touchAction: 'pan-x pan-y pinch-zoom' } as const
const ZOOMED = { cursor: 'zoom-out', width: '200%', maxWidth: 'none' } as const
const CENTRE = { ...LAYER, top: '50%', left: '50%', width: 'max-content', translate: '-50% -50%', gap: 8 } as const
const FRAME = { background: 'var(--photo-ground)', minWidth: 'min(16rem, calc(100vw - 24px))', minHeight: '10rem' } as const
const SCROLLER = { ...PAN, width: '100%', height: '100%', overflow: 'auto' } as const
const CLOSE = { top: 0, right: 0, zIndex: 1 } as const
const HINT = { maxWidth: 'calc(100vw - 2rem)', padding: '4px 12px' } as const

// The template's two covers in a popup the size of the picture itself (Owner 2026-11-14: the
// full-screen black viewer left the picture small in the middle and its ✕ far away). One image
// at a time in its own aspect ratio; 原图 / AI on its top-left corner (or a sideways swipe), ✕ on
// its top-right. A tap zooms to twice the width inside the same frame, panned by scrolling; the
// browser's own pinch zoom stays on. ✕, Esc, a tap on the scrim and Back all close it.
export function SampleViewer({ open, onOpenChange, before, after, name, side, onSide }: Props) {
  const t = useTranslations('app.template')
  const frame = useRef<HTMLDivElement>(null)
  // Zoomed keeps the frame at the size it had, so the picture grows inside it.
  const [box, setBox] = useState<Box | null>(null)
  const dismiss = useBackToClose(() => onOpenChange(false))
  const pick = (next: ViewerSide) => (setBox(null), onSide(next))
  const swipe = useSwipe(box !== null, (direction) => pick(direction === 'left' ? 'ai' : 'phone'))
  const toggleZoom = () => {
    if (swipe.consumed()) return
    const rect = frame.current?.getBoundingClientRect()
    setBox((was) => (was || !rect ? null : { width: rect.width, height: rect.height }))
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay style={SCRIM} className="fixed inset-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          style={CENTRE}
          className="fixed flex flex-col items-center text-white outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{t('viewerTitle', { name })}</DialogPrimitive.Title>
          <div
            ref={frame}
            style={box ? { ...FRAME, ...box } : FRAME}
            className="hairline relative grid place-items-center overflow-hidden rounded-media"
          >
            <div {...swipe.handlers} style={box ? SCROLLER : PAN} className="overscroll-contain">
              {(['phone', 'ai'] as const).map((key) => (
                <img
                  key={key}
                  {...coverImage(key === 'phone' ? before : after, box ? '200vw' : '100vw')}
                  hidden={key !== side}
                  alt={key === 'phone' ? t('phonePhotoAlt') : t('resultAlt', { name })}
                  decoding="async"
                  onClick={toggleZoom}
                  style={box ? ZOOMED : FIT}
                  className="block select-none"
                  draggable={false}
                />
              ))}
            </div>
            <SideToggle side={side} onSide={pick} />
            <DialogPrimitive.Close aria-label={t('viewerClose')} style={CLOSE} className="press absolute grid size-11 place-items-center rounded-full">
              <CloseMark />
            </DialogPrimitive.Close>
          </div>
          <p style={HINT} className="frost rounded-full text-center text-caption text-foreground">{t(box ? 'viewerHintZoomed' : 'viewerHint')}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
