import type { ReactNode } from 'react'

import { GROWTH_COPY as COPY } from './copy'

// One overview section: heading, one plain sentence, content. Same frame as the details' blocks.
export function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 md:p-6">
      <header className="grid gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </header>
      {children}
    </section>
  )
}

export function SectionError({ title }: { title: string }) {
  return (
    <Section title={title} desc={COPY.unavailableBody}>
      <p role="status" className="rounded-md bg-muted px-4 py-6 text-center font-medium">
        {COPY.unavailable}
      </p>
    </Section>
  )
}
