import { Suspense, type ReactNode } from 'react'

import type { Block } from '../analytics/load'
import type { Range } from '../analytics/range'
import { overviewEnd, readGrowth, readPeople, type PeopleBlock } from '../growth/load'
import type { GrowthStats } from '../growth/stats'
import { GROWTH_COPY as COPY } from './copy'
import { FunnelSection } from './funnel-section'
import { Headline } from './headline'
import type { PeopleState } from './people-state'
import { RevenueSection } from './revenue-section'
import { SectionError } from './section'

// 「总览」 (ARCHITECTURE §16.2b). The database half renders as soon as it is read; PostHog's
// numbers have their own Suspense boundary, so a slow PostHog (up to its timeout) never holds back
// sign-ups or revenue. Both halves use one end time (overviewEnd).
export function GrowthView({ range }: { range: Range }) {
  const end = overviewEnd()
  return (
    <Suspense key={range} fallback={<GrowthSkeleton />}>
      <GrowthLoader range={range} end={end} />
    </Suspense>
  )
}

async function GrowthLoader({ range, end }: { range: Range; end: number }) {
  const db = await readGrowth(range, end)
  if (db.status !== 'ok') return <SectionError title={COPY.funnel.title} />
  const people = readPeople(range, end, db.data)
  const fallback = <PeopleParts range={range} db={db.data} state={{ status: 'loading' }} />
  return (
    <GrowthLayout db={db.data}>
      <Suspense fallback={fallback}>
        <PeopleLoaded range={range} db={db.data} people={people} />
      </Suspense>
    </GrowthLayout>
  )
}

async function PeopleLoaded({ range, db, people }: { range: Range; db: GrowthStats; people: Promise<PeopleBlock> }) {
  return <PeopleParts range={range} db={db} state={await people} />
}

// Everything that shows a PostHog number: the scope note, the headline and the funnel.
function PeopleParts({ range, db, state }: { range: Range; db: GrowthStats; state: PeopleState }) {
  const status = state.status === 'unconfigured' ? COPY.unconfigured : state.status === 'error' ? `PostHog ${COPY.unavailable}。` : null
  return (
    <>
      <div className="grid gap-1 text-sm text-muted-foreground">
        <p>{COPY.scope(db.admin_ids.length)}</p>
        <p>{status ?? COPY.freshness}</p>
      </div>
      <Headline range={range} db={db} people={state} />
      <FunnelSection db={db.periods.current} state={state} />
    </>
  )
}

function GrowthLayout({ db, children }: { db: GrowthStats; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-6">
      {children}
      <RevenueSection db={db.periods.current} />
    </div>
  )
}

// Synchronous composition with both halves already read (tests).
export function GrowthPanel({ range, db, people }: { range: Range; db: Block<GrowthStats>; people: PeopleState }) {
  if (db.status !== 'ok') return <SectionError title={COPY.funnel.title} />
  return (
    <GrowthLayout db={db.data}>
      <PeopleParts range={range} db={db.data} state={people} />
    </GrowthLayout>
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
