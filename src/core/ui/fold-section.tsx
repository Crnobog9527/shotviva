'use client'

import type { ReactNode } from 'react'

import { cn } from './cn'

type Props = {
  // Unique on the page: the header and its panel are tied together by it.
  id: string
  title: ReactNode
  // One line under the title, e.g. "2 / 3 filled · ✓"; stays visible while folded.
  summary?: ReactNode
  open: boolean
  onToggle(): void
  children: ReactNode
  className?: string
  // h3 when the fold sits under a page heading of its own (the poster editor's tabs).
  level?: 2 | 3
}

// A titled part of a long form that folds away (Owner 2026-11-14: a template with many fields
// shows them in groups, the first open, the rest folded). Folded content stays mounted (hidden),
// so a picked photo or a half-typed line survives folding.
export function FoldSection({ id, title, summary, open, onToggle, children, className, level = 2 }: Props) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <section aria-labelledby={`${id}-h`} className={cn('hairline-lit rounded-panel bg-card', className)}>
      <Heading id={`${id}-h`} className="m-0">
        <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}
          className="press flex min-h-14 w-full items-center gap-3 rounded-panel px-4 py-3 text-left">
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{title}</span>
            {summary ? <span className="text-caption leading-[1.4] font-normal text-muted-foreground">{summary}</span> : null}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
            className={cn('size-5 flex-none text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </Heading>
      <div id={`${id}-panel`} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  )
}
