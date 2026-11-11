import 'server-only'

import { cacheLife } from 'next/cache'

import { createAdminSupabase } from '../../auth'
import { posthogAccess } from '../analytics/access'
import { readBlock, type Block } from '../analytics/load'
import { PostHogQueryError, queryRunner } from '../analytics/posthog-query'
import { windowFor, type Range, type Window } from '../analytics/range'
import { loadPeople, type People, type PeopleInput } from './people'
import { loadGrowthStats, type GrowthStats } from './stats'

// Reads for the overview (ARCHITECTURE §16.2b). Both halves end at the same moment, rounded down
// to 5 minutes, so a funnel step can never look lower only because PostHog stopped counting
// earlier than the database (control review of #483). Both are cached for that long. Each half
// fails on its own: the database half renders first, PostHog's numbers stream in after it.

export type PeopleBlock = Block<People> | { status: 'unconfigured' }

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
