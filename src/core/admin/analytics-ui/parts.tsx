import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '../../ui/cn'
import { ANALYTICS_COPY as COPY } from './copy'
import type { Delta } from './format'

// Shared pieces of the analytics page. No client JS: the 「?」 is a native popover (top layer, so
// a table's scroll box cannot clip it; tap outside or Esc closes it) and every switch is a link.

export type Metric = { label: string; help: string }

type LabelProps = { id: string; metric: Metric; className?: string; sort?: { href: string; current: boolean; hint: string } }

// `id` must be unique on the page: block + metric key. With `sort`, the name is the sort link.
export function MetricLabel({ id, metric, className, sort }: LabelProps) {
  const popover = `help-${id}`
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {sort ? (
        <Link
          href={sort.href}
          aria-label={sort.hint}
          aria-current={sort.current ? 'true' : undefined}
          className={cn('underline-offset-4 hover:underline', sort.current ? 'font-semibold text-foreground' : 'text-muted-foreground')}
        >
          {sort.current ? <span aria-hidden>↓ </span> : null}
          {metric.label}
        </Link>
      ) : (
        <span>{metric.label}</span>
      )}
      <button
        type="button"
        popoverTarget={popover}
        aria-label={COPY.helpLabel(metric.label)}
        className="grid size-6 flex-none place-items-center rounded-full border border-border text-xs leading-none font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        ?
      </button>
      <span
        id={popover}
        popover="auto"
        role="tooltip"
        className="m-auto w-[min(20rem,calc(100vw-2rem))] rounded-lg whitespace-normal border border-border bg-popover p-4 text-left text-sm leading-relaxed font-normal text-popover-foreground shadow-lg backdrop:bg-black/50"
      >
        <span className="mb-1 block font-semibold">{metric.label}</span>
        {metric.help}
      </span>
    </span>
  )
}

export function DeltaText({ delta, className }: { delta: Delta; className?: string }) {
  if (!delta) return null
  const label = COPY.delta[delta.direction]
  return (
    <span className={cn('font-mono text-xs text-muted-foreground tabular-nums', className)} title={label}>
      <span className="sr-only">{label}</span>
      {delta.text}
    </span>
  )
}

type FrameProps = { title: string; desc: string; links?: { href: string; label: string }[]; children: ReactNode }

// One block: heading, one-line description, the PostHog links, then its content.
export function BlockFrame({ title, desc, links = [], children }: FrameProps) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-[1_1_18rem] gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
        {links.length ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                {link.label} ↗
              </a>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function Unavailable() {
  return (
    <div role="status" className="rounded-md bg-muted px-4 py-8 text-center">
      <p className="font-medium">{COPY.unavailable}</p>
      <p className="mt-1 text-sm text-muted-foreground">{COPY.unavailableBody}</p>
    </div>
  )
}

export function Empty({ text = COPY.empty }: { text?: string }) {
  return <p className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>
}

// While a block waits on PostHog.
export function BlockSkeleton({ title }: { title: string }) {
  return (
    <section aria-busy="true" className="grid gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="h-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
    </section>
  )
}

type Tab = { key: string; label: string; href: string }

// A row of links that behaves like a segmented switch; the current one is marked for screen readers.
export function LinkTabs({ label, tabs, current }: { label: string; tabs: Tab[]; current: string }) {
  return (
    <nav aria-label={label} className="flex max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? 'page' : undefined}
          className={cn(
            'flex min-h-9 items-center rounded px-3 text-sm font-medium whitespace-nowrap transition-colors',
            tab.key === current ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
