'use client'

import { useTranslations } from 'next-intl'
import { useRef, type PointerEvent } from 'react'

import { cn } from '@/core/ui/cn'

export type ViewerSide = 'phone' | 'ai'

// Inline, so the public pages' sheet stays small (scripts/public-css-check.ts).
const CORNER = { top: 8, left: 8, zIndex: 1 } as const
const DISC = { width: 32, height: 32 } as const

// 原图 / AI on the picture's top-left corner, frosted so it reads over any photo.
export function SideToggle({ side, onSide }: { side: ViewerSide; onSide(side: ViewerSide): void }) {
  const t = useTranslations('app.template')
  return (
    <div role="group" aria-label={t('viewerSwitch')} style={CORNER} className="frost absolute inline-flex rounded-full p-1">
      {(['phone', 'ai'] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={side === key}
          onClick={() => onSide(key)}
          className={cn('min-h-9 rounded-full px-5 text-caption font-semibold', side === key ? (key === 'ai' ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background') : 'text-foreground')}
        >
          {t(key)}
        </button>
      ))}
    </div>
  )
}

// A 44 px target on the picture's top-right corner; the visible disc is smaller so it covers
// less of the photo.
export function CloseMark() {
  return (
    <span style={DISC} className="frost grid place-items-center rounded-full text-white">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </span>
  )
}

// A sideways swipe this long (px) switches between the phone photo and the AI result.
const SWIPE = 48
const LONG_PRESS_MS = 500

// One finger, not zoomed: a sideways swipe switches sides. Zoomed, the finger pans instead.
// Safari can deliver a click when a long press ends, even with the image callout disabled.
export function useViewerGestures(zoomed: boolean, onSwipe: (direction: 'left' | 'right') => void) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null)
  const ignoreClick = useRef(false)
  const consumeClick = () => {
    const ignored = ignoreClick.current
    ignoreClick.current = false
    return ignored
  }
  const handlers = {
    onPointerDown(event: PointerEvent) {
      ignoreClick.current = false
      start.current = event.isPrimary ? { x: event.clientX, y: event.clientY, at: event.timeStamp } : null
    },
    onPointerUp(event: PointerEvent) {
      const from = start.current
      start.current = null
      if (!from) return
      ignoreClick.current = event.pointerType === 'touch' && event.timeStamp - from.at >= LONG_PRESS_MS
      if (zoomed) return
      const dx = event.clientX - from.x
      if (Math.abs(dx) < SWIPE || Math.abs(dx) <= Math.abs(event.clientY - from.y)) return
      ignoreClick.current = true
      onSwipe(dx < 0 ? 'left' : 'right')
    },
    onPointerCancel() {
      if (start.current) ignoreClick.current = true
      start.current = null
    },
  }
  return { handlers, consumeClick }
}
