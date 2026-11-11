import { Suspense } from 'react'

import type { Range } from '../analytics/range'
import { readOverview, type Overview } from '../growth/load'
import { GROWTH_COPY as COPY } from './copy'
import { FunnelSection } from './funnel-section'
import { Headline } from './headline'
import { RevenueSection } from './revenue-section'
import { SectionError } from './section'

// 「总览」 (ARCHITECTURE §16.2b): the headline, the consumer funnel and revenue. The database half
// always renders when it reads; PostHog's numbers show 「—」 where they are missing.
export function GrowthView({ range }: { range: Range }) {
  return (
    <Suspense key={range} fallback={<GrowthSkeleton />}>
      <GrowthLoader range={range} />
    </Suspense>
  )
}

async function GrowthLoader({ range }: { range: Range }) {
  return <GrowthPanel range={range} overview={await readOverview(range)} />
}

export function GrowthPanel({ range, overview }: { range: Range; overview: Overview }) {
  const { db, people } = overview
  if (db.status !== 'ok') return <SectionError title={COPY.funnel.title} />
  const current = people.status === 'ok' ? people.data : null
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-1 text-sm text-muted-foreground">
        <p>{COPY.scope(db.data.admin_ids.length)}</p>
        <p>{people.status === 'unconfigured' ? COPY.unconfigured : people.status === 'error' ? `PostHog ${COPY.unavailable}。${COPY.freshness}` : COPY.freshness}</p>
      </div>
      <Headline range={range} db={db.data} people={current} />
      <FunnelSection db={db.data.periods.current} people={current?.current ?? null} />
      <RevenueSection db={db.data.periods.current} />
    </div>
  )
}

function GrowthSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <div className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="h-80 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    </div>
  )
}
