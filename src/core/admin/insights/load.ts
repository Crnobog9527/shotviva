import 'server-only'

import { cacheLife } from 'next/cache'

import { createAdminSupabase } from '../../auth'
import { posthogAccess } from '../analytics/access'
import { readBlock, type Block } from '../analytics/load'
import { PostHogQueryError, queryRunner, type RunQuery } from '../analytics/posthog-query'
import { loadPromoterSlugs } from '../growth/promoters'
import { parsePeriod, type Bucket, type Period } from './period'
import { loadShares, loadTouches, loadVisitors, type ShareCounts, type Touches, type VisitorRow } from './posthog'
import { loadCohort, loadTemplateStats, type Cohort, type TemplateStats } from './reads'

// Reads for the 「漏斗」 and 「模板」 tabs (ARCHITECTURE §16.2c). Every read ends at the same moment,
// rounded down to 5 minutes, and is cached for that long; the database half renders first and
// the PostHog half streams in after it, each failing on its own as 「暂时读不到」.

export type PostHogBlock<T> = Block<T> | { status: 'unconfigured' }
export type FunnelPostHog = { visitors: VisitorRow[]; touches: Touches; truncated: boolean }

const STEP = 300_000
export const readEnd = (now = Date.now()) => Math.floor(now / STEP) * STEP

function profile() {
  cacheLife({ stale: 120, revalidate: 300, expire: 600 })
}

function runner(): RunQuery {
  const access = posthogAccess()
  if (!access) throw new PostHogQueryError('unauthorized')
  return queryRunner(access)
}

// The period is worked out again inside each cache entry from the same inputs, so its numbers
// and its dates always agree. Block.window is unused here; the period travels with the data.
type Range = { from: string; to: string; end: number }
const periodOf = (range: Range): Period => parsePeriod(range.from, range.to, range.end)
const asWindow = (period: Period) => ({ range: '30d' as const, start: period.start, end: period.end, prevStart: period.start, prevEnd: period.start })

async function cachedCohort(range: Range) {
  'use cache'
  profile()
  const period = periodOf(range)
  return { window: asWindow(period), data: { period, cohort: await loadCohort(createAdminSupabase(), period) } }
}

async function cachedFunnelPostHog(range: Range, bucket: Bucket, adminIds: string[], userIds: string[]) {
  'use cache'
  profile()
  const period = periodOf(range)
  const run = runner()
  const promoters = await loadPromoterSlugs(createAdminSupabase())
  const visitors = await loadVisitors(run, period, bucket, adminIds, promoters)
  const { touches, truncated } = await loadTouches(run, period, userIds, promoters)
  return { window: asWindow(period), data: { visitors, touches, truncated } }
}

async function cachedTemplates(range: Range) {
  'use cache'
  profile()
  const period = periodOf(range)
  return { window: asWindow(period), data: { period, stats: await loadTemplateStats(createAdminSupabase(), period) } }
}

async function cachedShares(range: Range) {
  'use cache'
  profile()
  const period = periodOf(range)
  return { window: asWindow(period), data: await loadShares(runner(), period) }
}

export function readCohort(range: Range): Promise<Block<{ period: Period; cohort: Cohort }>> {
  return readBlock('insights.cohort', () => cachedCohort(range))
}

export async function readFunnelPostHog(range: Range, bucket: Bucket, cohort: Cohort): Promise<PostHogBlock<FunnelPostHog>> {
  if (!posthogAccess()) return { status: 'unconfigured' }
  const userIds = cohort.people.map((p) => p.id).sort()
  return readBlock('insights.funnel_posthog', () => cachedFunnelPostHog(range, bucket, cohort.admin_ids, userIds))
}

export function readTemplateStats(range: Range): Promise<Block<{ period: Period; stats: TemplateStats }>> {
  return readBlock('insights.templates', () => cachedTemplates(range))
}

export async function readShares(range: Range): Promise<PostHogBlock<ShareCounts>> {
  if (!posthogAccess()) return { status: 'unconfigured' }
  return readBlock('insights.shares', () => cachedShares(range))
}
