'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage) */
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, useState, type PointerEvent } from 'react'

import { cn } from '@/core/ui/cn'
import { coverImage } from '@/core/ui/cover-image'

export type ViewerSide = 'phone' | 'ai'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  before: string
  after: string
  name: string
  side: ViewerSide
  onSide(side: ViewerSide): void
}

// One-off values as inline styles, so the public pages' sheet stays small (scripts/public-css-check.ts).
// Above the creation sheets (z-index 100).
const LAYER = { zIndex: 110 } as const
const FRAME = { ...LAYER, paddingTop: 'var(--sat)', paddingBottom: 'max(var(--sab), 12px)' } as const
const PAN = { touchAction: 'pan-x pan-y pinch-zoom' } as const
const FIT = { cursor: 'zoom-in' } as const
const ZOOMED = { cursor: 'zoom-out', width: '200%' } as const

// A sideways swipe this long (px) switches between the phone photo and the AI result.
const SWIPE = 48

// The template's two covers full screen (Owner 2026-11-13: on phones the dialog's pair is too
// small to judge). One image at a time, 原图 / AI to switch (or a sideways swipe), a tap or the
// button to zoom to twice the width and pan by scrolling; the browser's own pinch zoom stays on.
export function SampleViewer({ open, onOpenChange, before, after, name, side, onSide }: Props) {
  const t = useTranslations('app.template')
  const [zoomed, setZoomed] = useState(false)
  const swipe = useSwipe(zoomed, (direction) => onSide(direction === 'left' ? 'ai' : 'phone'))
  const url = side === 'phone' ? before : after
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (setZoomed(false), onOpenChange(next))}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black" style={LAYER} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          style={FRAME}
          className="fixed inset-0 flex flex-col bg-black text-white outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{t('viewerTitle', { name })}</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <SideToggle side={side} onSide={(next) => (setZoomed(false), onSide(next))} />
            <DialogPrimitive.Close aria-label={t('viewerClose')} className="press grid size-11 place-items-center rounded-full bg-wash-strong">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </DialogPrimitive.Close>
          </div>
          <div
            {...swipe.handlers}
            style={PAN}
            className={cn('relative min-h-0 flex-1 overflow-auto overscroll-contain', !zoomed && 'grid place-items-center')}
          >
            <img
              key={url}
              {...coverImage(url, zoomed ? '200vw' : '100vw')}
              alt={side === 'phone' ? t('phonePhotoAlt') : t('resultAlt', { name })}
              decoding="async"
              onClick={() => !swipe.consumed() && setZoomed((value) => !value)}
              style={zoomed ? ZOOMED : FIT}
              className={cn('select-none', zoomed ? 'max-w-none' : 'max-h-full max-w-full object-contain')}
              draggable={false}
            />
          </div>
          <p className="px-4 pt-2 text-center text-caption text-bone-dim">{t(zoomed ? 'viewerHintZoomed' : 'viewerHint')}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function SideToggle({ side, onSide }: { side: ViewerSide; onSide(side: ViewerSide): void }) {
  const t = useTranslations('app.template')
  return (
    <div role="group" aria-label={t('viewerSwitch')} className="inline-flex rounded-full bg-wash-strong p-1">
      {(['phone', 'ai'] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={side === key}
          onClick={() => onSide(key)}
          className={cn('min-h-9 rounded-full px-5 text-caption font-semibold', side === key ? (key === 'ai' ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background') : 'text-bone-dim')}
        >
          {t(key)}
        </button>
      ))}
    </div>
  )
}

// One finger, not zoomed: a sideways swipe switches sides. Zoomed, the finger pans instead.
// A swipe is not also a tap: the click that follows it is consumed.
function useSwipe(zoomed: boolean, onSwipe: (direction: 'left' | 'right') => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const consumed = () => {
    const was = swiped.current
    swiped.current = false
    return was
  }
  const handlers = {
    onPointerDown(event: PointerEvent) {
      swiped.current = false
      start.current = event.isPrimary && !zoomed ? { x: event.clientX, y: event.clientY } : null
    },
    onPointerUp(event: PointerEvent) {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = event.clientX - from.x
      if (Math.abs(dx) < SWIPE || Math.abs(dx) <= Math.abs(event.clientY - from.y)) return
      swiped.current = true
      onSwipe(dx < 0 ? 'left' : 'right')
    },
    onPointerCancel() {
      start.current = null
    },
  }
  return { handlers, consumed }
}
