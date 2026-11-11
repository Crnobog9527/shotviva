'use client'

/* eslint-disable @next/next/no-img-element -- small static demo images, described by the stage's label */
import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

const MOVE = 'motion-reduce:transition-none'

// One photo developing into its result, the darkroom way: the phone photo sits in the tray and
// the result comes up through it, from a soft grey blur to sharp colour.
export function Develop({ phone, result, developed, delay = 0, className }: { phone: string; result: string; developed: boolean; delay?: number; className?: string }) {
  return (
    <span className={cn('relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-muted', className)}>
      <img src={phone} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />
      <img
        src={result}
        alt=""
        decoding="async"
        style={{ transitionDelay: `${delay}ms` }}
        className={cn('absolute inset-0 size-full object-cover transition-[opacity,filter] duration-900 ease-(--ease)', MOVE, developed ? 'opacity-100' : 'opacity-0 blur-[10px] grayscale')}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_0_1px_var(--border)]" />
    </span>
  )
}

// Something that arrives in its phase: rises a few pixels and fades in, after `delay`.
export function Arrive({ on, delay = 0, className, style, children }: { on: boolean; delay?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <span
      style={{ transitionDelay: `${delay}ms`, ...style }}
      className={cn('block transition-[opacity,translate,scale] duration-[420ms] ease-(--ease)', MOVE, on ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.96] opacity-0', className)}
    >
      {children}
    </span>
  )
}

// The tray the demo plays in, labelled as one picture for screen readers (the images are
// decoration inside it), with "Play again" and the plain caption under it.
export function Stage({ label, caption, onReplay, reduce, children }: { label: string; caption: string; onReplay(): void; reduce: boolean; children: ReactNode }) {
  const t = useTranslations('app.gated')
  return (
    <figure className="mt-4">
      <div role="img" aria-label={label} className="hairline overflow-hidden rounded-[20px] bg-background p-3">
        {children}
      </div>
      <figcaption className="mt-2 flex items-start justify-between gap-3">
        <span className="pt-1 text-caption leading-[1.4] text-muted-foreground">{caption}</span>
        {reduce ? null : (
          <button type="button" onClick={onReplay} className="press -mt-1 inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full px-1 text-caption font-semibold text-foreground">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12a8 8 0 1 0 2.4-5.7" />
              <path d="M4 4v4h4" />
            </svg>
            {t('replay')}
          </button>
        )}
      </figcaption>
    </figure>
  )
}
