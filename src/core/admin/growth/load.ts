import 'server-only'

import { cacheLife } from 'next/cache'

import { createAdminSupabase } from '../../auth'
import { posthogAccess } from '../analytics/access'
import { readBlock, type Block } from '../analytics/load'
import { PostHogQueryError, queryRunner } from '../analytics/posthog-query'
import { windowFor, type Range, type Window } from '../analytics/range'
import { loadPeople, type People, type PeopleInput } from './people'
import { loadGrowthStats, type GrowthStats } from './stats'

// Reads for the overview (ARCHITECTURE §16.2b). The database half is cheap and is what the Owner
// checks after a sale, so it is cached for a minute; the PostHog half for 10 minutes, like the
// rest of the page (§16.2a). Each half fails on its own and shows 「暂时读不到」 only for itself.

export type PeopleBlock = Block<People> | { status: 'unconfigured' }
export type Overview = { db: Block<GrowthStats>; people: PeopleBlock }

const MINUTE = 60_000
const TEN_MINUTES = 600_000
const floorTo = (ms: number, step: number) => Math.floor(ms / step) * step

async function cachedGrowth(range: Range, end: number): Promise<{ window: Window; data: GrowthStats }> {
  'use cache'
  cacheLife({ stale: 30, revalidate: 60, expire: 300 })
  const window = windowFor(range, new Date(end))
  return { window, data: await loadGrowthStats(createAdminSupabase(), window) }
}

async function cachedPeople(range: Range, end: number, input: PeopleInput): Promise<{ window: Window; data: People }> {
  'use cache'
  cacheLife({ stale: 300, revalidate: 600, expire: 900 })
  const access = posthogAccess()
  if (!access) throw new PostHogQueryError('unauthorized')
  const window = windowFor(range, new Date(end))
  return { window, data: await loadPeople(queryRunner(access), window, input) }
}

export async function readOverview(range: Range, now = Date.now()): Promise<Overview> {
  const db = await readBlock('growth.db', () => cachedGrowth(range, floorTo(now, MINUTE)))
  if (!posthogAccess()) return { db, people: { status: 'unconfigured' } }
  if (db.status === 'error') return { db, people: { status: 'error' } }
  const input: PeopleInput = {
    adminIds: db.data.admin_ids,
    cohort: { current: db.data.periods.current.cohort, previous: db.data.periods.previous.cohort },
  }
  const people = await readBlock('growth.people', () => cachedPeople(range, floorTo(now, TEN_MINUTES), input))
  return { db, people }
}
