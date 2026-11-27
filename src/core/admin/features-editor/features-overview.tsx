'use client'

import { Badge } from '@/core/ui/badge'

import { FEATURES_COPY as COPY } from './copy'
import { overviewRows, type OverviewInput } from './overview'

// A client component because the rows read copy that lives in client card modules.
// Every switch's state at a glance. Only links: each switch is changed on its own card, so there
// is one place to click per switch.
export function FeaturesOverview({ input }: { input: OverviewInput }) {
  const C = COPY.overview
  const rows = overviewRows(input)
  return (
    <section aria-labelledby="features-overview-title" className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-1">
        <h2 id="features-overview-title" className="font-medium">
          {C.title}
        </h2>
        <p className="text-sm text-muted-foreground">{C.hint}</p>
      </div>
      <ul className="grid text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
        <li className="hidden text-xs text-muted-foreground sm:contents" aria-hidden>
          <span className="pb-2">{C.columns.name}</span>
          <span className="pb-2">{C.columns.section}</span>
          <span className="pb-2 text-right">{C.columns.state}</span>
        </li>
        {rows.map((row) => (
          <li key={row.href} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t border-border py-2 sm:col-span-3 sm:grid-cols-subgrid">
            <a href={row.href} className="min-w-0 font-medium underline-offset-4 hover:underline">
              {row.name}
            </a>
            <span className="col-start-1 row-start-2 text-xs text-muted-foreground sm:col-start-auto sm:row-start-auto sm:text-sm">{row.section}</span>
            <span className="col-start-2 row-span-2 row-start-1 flex items-center justify-end gap-2 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
              {row.emergency ? <Badge variant="outline">{C.emergency}</Badge> : null}
              <Badge variant={row.on ? 'default' : 'secondary'}>{row.state}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
