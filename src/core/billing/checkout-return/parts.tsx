import type { ReactNode } from 'react'

import { cn } from '../../ui/cn'

// The return page's shared pieces (comps-v3-b checkout.html): the plate on its safelight glow,
// the glyph, the receipt rows. Presentational only.

export function ReturnPlate({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <div
      data-state={pending ? 'pending' : 'success'}
      className="relative grid min-h-[calc(100dvh-var(--sab)-80px)] overflow-x-clip place-items-start justify-items-center px-[var(--gutter)] pt-[calc(var(--sat)+32px)] pb-6 md:min-h-[calc(100dvh-56px)] md:place-items-center md:py-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[36%] left-1/2 h-[520px] w-[min(900px,140vw)] -translate-1/2 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_70%)]"
      />
      <section className="return-plate relative z-[1] w-full max-w-[440px] md:max-w-[480px] md:rounded-panel md:bg-card md:p-8 md:shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_rgba(255,255,255,.035),0_40px_80px_-40px_rgba(0,0,0,.9)]">
        {children}
      </section>
    </div>
  )
}

export function Glyph({ pending }: { pending: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'mb-5 grid size-14 place-items-center rounded-[18px]',
        pending
          ? 'bg-wash text-primary shadow-[inset_0_0_0_1px_var(--border)]'
          : 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--success)_40%,transparent)]',
      )}
    >
      <svg viewBox="0 0 24 24" className={cn('size-[26px]', pending && 'return-tick')} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {pending ? (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </>
        ) : (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        )}
      </svg>
    </div>
  )
}

export function Rows({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-6 rounded-[20px] bg-card px-4 py-1 shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_rgba(255,255,255,.035)] md:bg-wash-faint md:shadow-[inset_0_0_0_1px_var(--border)]">
      {children}
    </dl>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-baseline justify-between gap-4 py-3 [&+&]:border-t [&+&]:border-hairline">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="text-right text-body leading-[1.3]">{children}</dd>
    </div>
  )
}

// "+135 credits" / "138 credits": the number in the display face, the unit small in mono.
export function Credits({ count, unit, added = false }: { count: string; unit: string; added?: boolean }) {
  return (
    <span className="font-display text-2xl leading-none tracking-[-0.01em]">
      <span className={added ? 'text-success' : undefined}>{count}</span>
      <small className="ml-1.5 font-mono text-caption text-muted-foreground">{unit}</small>
    </span>
  )
}

export const titleClass = 'font-display text-title leading-[1.02] tracking-[-0.02em] text-balance md:text-[40px]'
export const subClass = 'mt-2.5 text-body leading-normal text-pretty text-bone-dim'
export const fineClass = 'mt-3 text-center text-caption leading-normal text-pretty text-muted-foreground'
export const linkClass = 'inline-flex min-h-11 items-center gap-1.5 text-label font-medium text-bone-dim hover:text-foreground hover:underline hover:underline-offset-3'
