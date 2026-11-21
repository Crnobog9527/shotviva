'use client'

import type { ReactNode } from 'react'
import { useId } from 'react'

import { cn } from '@/core/ui/cn'

import type { Outcome } from './use-console-action'

// Small building blocks shared by the enterprise block: the account page's own card look
// (hairline panel on the card surface), a labelled number field, and the one-line outcome.

export function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('hairline-lit rounded-panel bg-card p-4', className)}>
      <h2 id={id} className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{title}</h2>
      {hint ? <p className="mt-1 text-label text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

export function Result({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null
  return <p role={outcome.ok ? 'status' : 'alert'} className={cn('text-label', outcome.ok ? 'text-muted-foreground' : 'text-destructive')}>{outcome.text}</p>
}

export const FIELD = 'h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-headline font-semibold tabular-nums">{value}</p>
      {note ? <p className="text-caption text-muted-foreground">{note}</p> : null}
    </div>
  )
}
