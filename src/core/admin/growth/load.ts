import 'server-only'

import { cacheLife } from 'next/cache'

import { createAdminSupabase } from '../../auth'
import { posthogAccess } from '../analytics/access'
import { readBlock, type Block } from '../analytics/load'
import { PostHogQueryError, queryRunner } from '../analytics/posthog-query'
import { readPvuvBreakdown, readPvuvOverview, type PvuvState } from '../analytics/pvuv-load'
import type { PvuvBreakdown, PvuvOverview } from '../analytics/pvuv-read'
import { windowFor, type Range, type Window } from '../analytics/range'
import { loadPeople, type People, type PeopleInput } from './people'
import { loadPromoterSlugs } from './promoters'
import { loadSources, type SourceReads } from './sources'
import { loadGrowthStats, type GrowthStats } from './stats'

// Reads for the overview (ARCHITECTURE §16.2b). Both halves end at the same moment, rounded down
// to 5 minutes, so a funnel step can never look lower only because PostHog stopped counting
// earlier than the database (control review of #483). Both are cached for that long. Each half
// fails on its own: the database half renders first, PostHog's numbers stream in after it.

export type PeopleBlock = Block<People> | { status: 'unconfigured' }
export type SourcesBlock = Block<SourceReads> | { status: 'unconfigured' }

const STEP = 300_000
export const overviewEnd = (now = Date.now()) => Math.floor(now / STEP) * STEP

function profile() {
  cacheLife({ stale: 120, revalidate: 300, expire: 600 })
}

async function cachedGrowth(range: Range, end: number): Promise<{ window: Window; data: GrowthStats }> {
  'use cache'
  profile()
  const window = windowFor(range, new Date(end))
  return { window, data: await loadGrowthStats(createAdminSupabase(), window) }
}

async function cachedPeople(range: Range, end: number, input: PeopleInput): Promise<{ window: Window; data: People }> {
  'use cache'
  profile()
  const access = posthogAccess()
  if (!access) throw new PostHogQueryError('unauthorized')
  const window = windowFor(range, new Date(end))
  return { window, data: await loadPeople(queryRunner(access), window, input) }
}

export function readGrowth(range: Range, end: number): Promise<Block<GrowthStats>> {
  return readBlock('growth.db', () => cachedGrowth(range, end))
}

// Same range and end as the database read it follows; the ids come from that read.
export async function readPeople(range: Range, end: number, db: GrowthStats): Promise<PeopleBlock> {
  if (!posthogAccess()) return { status: 'unconfigured' }
  const input: PeopleInput = {
    adminIds: db.admin_ids,
    cohort: { current: db.periods.current.cohort, previous: db.periods.previous.cohort },
  }
  return readBlock('growth.people', () => cachedPeople(range, end, input))
}

async function cachedSources(range: Range, end: number, adminIds: string[], userIds: string[]): Promise<{ window: Window; data: SourceReads }> {
  'use cache'
  profile()
  const access = posthogAccess()
  if (!access) throw new PostHogQueryError('unauthorized')
  const window = windowFor(range, new Date(end))
  const promoters = await loadPromoterSlugs(createAdminSupabase())
  return { window, data: await loadSources(queryRunner(access), window, { adminIds, userIds, promoters }) }
}

// The source table's PostHog reads, for the current period's sign-ups and buyers.
export async function readSources(range: Range, end: number, db: GrowthStats): Promise<SourcesBlock> {
  if (!posthogAccess()) return { status: 'unconfigured' }
  const current = db.periods.current
  const userIds = [...new Set([...current.cohort, ...current.buyers.map((b) => b.user_id)])].sort()
  return readBlock('growth.sources', () => cachedSources(range, end, db.admin_ids, userIds))
}

// While PostHog is not read (switched off 2026-11-21), the overview's visitors, top sources and
// top pages come from PVUV.ai. Null while PostHog is read: PVUV is then not asked. Three reads in
// parallel, each failing on its own.
export type OverviewPvuv = {
  overview: Promise<PvuvState<PvuvOverview>>
  sources: Promise<PvuvState<PvuvBreakdown>>
  pages: Promise<PvuvState<PvuvBreakdown>>
}

export function readOverviewPvuv(range: Range): OverviewPvuv | null {
  if (posthogAccess()) return null
  return { overview: readPvuvOverview(range), sources: readPvuvBreakdown(range, 'source'), pages: readPvuvBreakdown(range, 'page') }
}
