import { Suspense, type ReactNode } from 'react'

import type { Block } from '../analytics/load'
import type { Range } from '../analytics/range'
import type { PvuvState } from '../analytics/pvuv-load'
import type { PvuvOverview } from '../analytics/pvuv-read'
import { overviewEnd, readGrowth, readOverviewPvuv, readPeople, readSources, type OverviewPvuv, type PeopleBlock, type SourcesBlock } from '../growth/load'
import type { GrowthStats } from '../growth/stats'
import { GROWTH_COPY as COPY } from './copy'
import { FunnelSection } from './funnel-section'
import { Headline } from './headline'
import { pvuvInUse, type PeopleState, type PvuvOverviewState } from './people-state'
import { PvuvSection, type PvuvBreakdownState } from './pvuv-section'
import { RevenueSection } from './revenue-section'
import { SectionError } from './section'
import { SourcesSection, type SourcesState } from './sources-section'

// 「总览」 (ARCHITECTURE §16.2b). The database half renders as soon as it is read; PostHog's
// numbers have their own Suspense boundary, so a slow PostHog (up to its timeout) never holds back
// sign-ups or revenue. Both halves use one end time (overviewEnd). While PostHog is off, PVUV.ai
// stands in for visitors and adds its own block (sources, pages); its reads start first and stream
// in on their own.
export function GrowthView({ range }: { range: Range }) {
  const end = overviewEnd()
  return (
    <Suspense key={range} fallback={<GrowthSkeleton />}>
      <GrowthLoader range={range} end={end} />
    </Suspense>
  )
}

async function GrowthLoader({ range, end }: { range: Range; end: number }) {
  const pvuv = readOverviewPvuv(range)
  const db = await readGrowth(range, end)
  if (db.status !== 'ok') return <SectionError title={COPY.funnel.title} />
  const people = readPeople(range, end, db.data)
  const sources = readSources(range, end, db.data)
  const current = db.data.periods.current
  const loading = { status: 'loading' } as const
  const fallback = <PeopleParts range={range} db={db.data} state={loading} pvuv={pvuv ? loading : null} />
  return (
    <GrowthLayout
      db={db.data}
      pvuv={
        pvuv ? (
          <Suspense fallback={<PvuvSection range={range} overview={loading} sources={loading} pages={loading} />}>
            <PvuvLoaded range={range} pvuv={pvuv} />
          </Suspense>
        ) : null
      }
      sources={
        <Suspense fallback={<SourcesSection db={current} state={{ status: 'loading' }} />}>
          <SourcesLoaded db={current} sources={sources} />
        </Suspense>
      }
    >
      <Suspense fallback={fallback}>
        <PeopleLoaded range={range} db={db.data} people={people} pvuv={pvuv?.overview ?? null} />
      </Suspense>
    </GrowthLayout>
  )
}

async function SourcesLoaded({ db, sources }: { db: GrowthStats['periods']['current']; sources: Promise<SourcesBlock> }) {
  return <SourcesSection db={db} state={await sources} />
}

type PeopleLoadedProps = { range: Range; db: GrowthStats; people: Promise<PeopleBlock>; pvuv: Promise<PvuvState<PvuvOverview>> | null }

async function PeopleLoaded({ range, db, people, pvuv }: PeopleLoadedProps) {
  const [state, visitors] = await Promise.all([people, pvuv])
  return <PeopleParts range={range} db={db} state={state} pvuv={visitors} />
}

async function PvuvLoaded({ range, pvuv }: { range: Range; pvuv: OverviewPvuv }) {
  const [overview, sources, pages] = await Promise.all([pvuv.overview, pvuv.sources, pvuv.pages])
  return <PvuvSection range={range} overview={overview} sources={sources} pages={pages} />
}

// Everything that shows a visitor number: the scope note, the headline and the funnel. Visitors
// are PostHog's, or PVUV's while PostHog is off (pvuv is null while PostHog is read).
function PeopleParts({ range, db, state, pvuv }: { range: Range; db: GrowthStats; state: PeopleState; pvuv: PvuvOverviewState | null }) {
  const viaPvuv = pvuvInUse(state, pvuv)
  const status = viaPvuv ? COPY.freshnessPvuv : state.status === 'unconfigured' ? COPY.unconfigured : state.status === 'error' ? `PostHog ${COPY.unavailable}。` : null
  return (
    <>
      <div className="grid gap-1 text-sm text-muted-foreground">
        <p>{COPY.scope(db.admin_ids.length)}</p>
        <p>{status ?? COPY.freshness}</p>
      </div>
      <Headline range={range} db={db} people={state} pvuv={pvuv} />
      <FunnelSection range={range} db={db.periods.current} state={state} pvuv={pvuv} />
    </>
  )
}

// Headline and funnel, then PVUV's block (PostHog off), then where people come from, then
// revenue; the PostHog and PVUV parts load independently and never hold back revenue.
function GrowthLayout({ db, children, pvuv, sources }: { db: GrowthStats; children: ReactNode; pvuv?: ReactNode; sources: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-6">
      {children}
      {pvuv}
      {sources}
      <RevenueSection db={db.periods.current} />
    </div>
  )
}

// Synchronous composition with both halves already read (tests).
type PanelPvuv = { overview: PvuvOverviewState; sources: PvuvBreakdownState; pages: PvuvBreakdownState }
type PanelProps = { range: Range; db: Block<GrowthStats>; people: PeopleState; sources?: SourcesState; pvuv?: PanelPvuv | null }
export function GrowthPanel({ range, db, people, sources = { status: 'loading' }, pvuv = null }: PanelProps) {
  if (db.status !== 'ok') return <SectionError title={COPY.funnel.title} />
  return (
    <GrowthLayout
      db={db.data}
      pvuv={pvuv ? <PvuvSection range={range} overview={pvuv.overview} sources={pvuv.sources} pages={pvuv.pages} /> : null}
      sources={<SourcesSection db={db.data.periods.current} state={sources} />}
    >
      <PeopleParts range={range} db={db.data} state={people} pvuv={pvuv?.overview ?? null} />
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
