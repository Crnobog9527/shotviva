import type { ReactNode } from 'react'

// One section of 功能开关 (Owner 2026-11-27): a heading, one line on what is in it, its cards.
export function FeatureSection({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-20 gap-3">
      <div className="grid gap-1 border-b border-border pb-2">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  )
}

// A card that belongs to the one above it (e.g. 创作页秒开 under 手机离线缓存), indented.
export function ChildCard({ children }: { children: ReactNode }) {
  return <div className="ml-3 border-l-2 border-border pl-3 sm:ml-6 sm:pl-5">{children}</div>
}

