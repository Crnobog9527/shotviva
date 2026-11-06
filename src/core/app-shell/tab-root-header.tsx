import type { ReactNode } from 'react'

// Tab roots open on a large serif title with at most one thing on the right (a balance chip
// or a count), DESIGN §8.2 and "Large title".
export function TabRootHeader({ title, aside, lede }: { title: string; aside?: ReactNode; lede?: string }) {
  return (
    <header className="pt-[calc(var(--sat)+8px)] md:pt-8">
      <div className="flex items-end justify-between gap-3 px-(--gutter)">
        <h1 className="font-display text-large-title leading-[0.9] tracking-[-0.03em]">{title}</h1>
        {aside ? <div className="mb-1 flex items-center gap-2">{aside}</div> : null}
      </div>
      {lede ? <p className="px-(--gutter) pt-2 text-body text-muted-foreground">{lede}</p> : null}
    </header>
  )
}
