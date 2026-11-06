import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { cn } from '../../ui/cn'

// Account page building blocks (comps-v3-b/account.html): a titled group, and the plain 56px
// rows of the Settings and Session panels, hairlines between them, value and safelight chevron
// on the right.

export function Group({ title, hideTitle = false, children }: { title: string; hideTitle?: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mx-4 mt-6">
      <h2 id={id} className={cn('mb-2 text-headline leading-[1.2] font-semibold tracking-[-0.01em]', hideTitle && 'sr-only')}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export function RowsPanel({ children }: { children: ReactNode }) {
  return <div className="hairline-lit divide-y divide-hairline rounded-panel bg-card px-4">{children}</div>
}

export const rowClass = 'flex min-h-14 w-full items-center justify-between gap-3 text-left text-body text-foreground'

export function Chevron({ className }: { className?: string }) {
  return <ChevronRight aria-hidden strokeWidth={1.75} className={cn('size-[18px] shrink-0 text-primary', className)} />
}

// The right-hand side of a row: its current value, then the chevron when the row goes somewhere.
export function RowValue({ children, chevron = true }: { children?: ReactNode; chevron?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-label text-muted-foreground">
      {children}
      {chevron ? <Chevron /> : null}
    </span>
  )
}
