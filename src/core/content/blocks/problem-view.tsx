import type { ReactNode } from 'react'

type Props = { code: string; heading: { lead: string; emphasis: string }; body: ReactNode; actions: ReactNode; children?: ReactNode }

// The site's 404 and error pages (design/comps-v3-b/404.html): the real status code in mono,
// the serif heading with its last words in safelight, one sentence, two actions, then
// whatever the page offers instead (the 404's three templates).
export function ProblemView({ code, heading, body, actions, children }: Props) {
  return (
    <section className="mx-auto w-full max-w-[calc(1120px+2*var(--gutter))] px-(--gutter) pt-12 md:pt-20 lg:pt-24">
      <p className="font-mono text-caption text-muted-foreground">{code}</p>
      <h1 className="mt-3 font-display text-[40px] leading-none tracking-[-0.025em] text-balance md:text-[52px] lg:text-[56px]">
        {heading.lead} <em className="text-primary italic">{heading.emphasis}</em>
      </h1>
      <p className="mt-3 max-w-[44ch] text-body text-bone-dim">{body}</p>
      <div className="mt-6 grid gap-2 md:flex md:flex-wrap">{actions}</div>
      {children}
    </section>
  )
}

// The two button looks of the page: the one primary, and the ghost beside it.
export const PROBLEM_PRIMARY =
  'press inline-flex min-h-14 items-center justify-center rounded-tile bg-primary px-7 text-cta font-semibold tracking-[-0.01em] text-primary-foreground shadow-raised md:min-w-[220px]'
export const PROBLEM_GHOST =
  'press hairline inline-flex min-h-13 items-center justify-center rounded-control bg-wash px-6 text-body font-semibold text-foreground md:min-w-[180px]'
