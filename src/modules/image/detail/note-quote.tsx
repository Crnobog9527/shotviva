'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/core/ui/cn'

// "Your note" (T6 photo.html, T32): what the user wrote in "Anything to change?", quoted as
// typed. Clamped to four lines; Show more appears only when the clamp actually hides text.
export function NoteQuote({ note }: { note: string }) {
  const t = useTranslations('app.result')
  const quote = useRef<HTMLQuoteElement>(null)
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const element = quote.current
    if (!element || open) return
    const measure = () => setClipped(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, note])
  return (
    <div className="hairline mt-3 rounded-panel bg-wash px-3.5 py-3 text-body leading-[1.4]">
      <p className="mb-1 text-caption leading-none font-medium text-muted-foreground">{t('yourNote')}</p>
      <q ref={quote} className={cn('block break-words whitespace-pre-line', !open && 'line-clamp-4')}>
        {note}
      </q>
      {clipped || open ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((on) => !on)} className="press mt-1.5 inline-flex min-h-8 items-center gap-0.5 text-caption font-medium">
          {t(open ? 'showLess' : 'showMore')}
          <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4 text-primary transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
