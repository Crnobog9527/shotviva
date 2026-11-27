import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { logger } from '../../logger'
import { pvuvBreakdown, type PvuvAccess, type PvuvBreakdown, type PvuvPeriod, type PvuvRow } from './pvuv-read'
import type { Range, Window } from './range'

// /admin/analytics' 「模板合集分享」 (ARCHITECTURE §5.1g): links made, by whom and how many revoked,
// from the database; opens, sign-up taps and sign-ups from PVUV.ai, where the page's events go
// (template_collection_open, template_collection_signup_start, signup.share_collection_id).
// PVUV counts in its site's timezone; the database counts in the page's Beijing-day window.

export const TOP_COLLECTIONS = 10

export type Counted = { visitors: number | null; events: number | null }
export type TopCollection = { id: string; title: string | null; visitors: number | null; signups: number | null }
export type PvuvCollections =
  | { status: 'unconfigured' }
  | { status: 'failed' }
  | { status: 'ok'; ready: boolean; opens: Counted; signupStarts: Counted; signups: number | null; top: TopCollection[] }
export type CollectionStats = { links: number; creators: number; revoked: number; pvuv: PvuvCollections }

const PERIOD: Record<Range, PvuvPeriod> = { today: 'today', '7d': '7d', '30d': '30d' }
const NONE: Counted = { visitors: 0, events: 0 }
const COLLECTION_ID = /^[a-z0-9]{12}$/

const statsRow = z.object({ links: z.coerce.number(), creators: z.coerce.number(), revoked: z.coerce.number() })

async function readDb(admin: SupabaseClient, window: Window) {
  const { data, error } = await admin.rpc('admin_template_share_stats', { p_start: window.start, p_end: window.end })
  if (error) throw new Error('template share stats failed', { cause: error })
  return statsRow.parse((data as unknown[])[0] ?? { links: 0, creators: 0, revoked: 0 })
}

const goalOf = (goals: PvuvBreakdown, name: string): Counted => {
  const row = goals.rows.find((item) => item.value === name)
  return row ? { visitors: row.visitors, events: row.events } : NONE
}

// People who signed up after opening a collection: each signup row is one collection link.
const sumVisitors = (rows: readonly PvuvRow[]) => (rows.some((row) => row.visitors === null) ? null : rows.reduce((sum, row) => sum + (row.visitors ?? 0), 0))

export function shapePvuv(goals: PvuvBreakdown, byCollection: PvuvBreakdown, signups: PvuvBreakdown, titles: ReadonlyMap<string, string | null>) {
  const signupsBy = new Map(signups.rows.map((row) => [row.value, row.visitors]))
  const top = byCollection.rows
    .filter((row) => COLLECTION_ID.test(row.value))
    .slice(0, TOP_COLLECTIONS)
    .map((row) => ({ id: row.value, title: titles.get(row.value) ?? null, visitors: row.visitors, signups: signupsBy.get(row.value) ?? 0 }))
  return {
    status: 'ok' as const,
    ready: goals.ready && byCollection.ready && signups.ready,
    opens: goalOf(goals, 'template_collection_open'),
    signupStarts: goalOf(goals, 'template_collection_signup_start'),
    signups: sumVisitors(signups.rows),
    top,
  }
}

async function titlesOf(admin: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await admin.from('template_shares').select('id, title').in('id', ids).returns<{ id: string; title: string | null }[]>()
  if (error) return new Map()
  return new Map(data.map((row) => [row.id, row.title]))
}

async function readPvuv(admin: SupabaseClient, access: PvuvAccess | null, range: Range): Promise<PvuvCollections> {
  if (!access) return { status: 'unconfigured' }
  const period = PERIOD[range]
  try {
    const [goals, byCollection, signups] = await Promise.all([
      pvuvBreakdown(access, { dim: 'goal', period, limit: 200 }),
      pvuvBreakdown(access, { dim: 'prop:collection_id', period, limit: TOP_COLLECTIONS }),
      pvuvBreakdown(access, { dim: 'prop:share_collection_id', period, limit: 1000 }),
    ])
    const ids = byCollection.rows.map((row) => row.value).filter((id) => COLLECTION_ID.test(id))
    return shapePvuv(goals, byCollection, signups, await titlesOf(admin, ids))
  } catch (error) {
    logger.warn('admin.collections.pvuv_failed', { error })
    return { status: 'failed' }
  }
}

export async function loadCollectionStats(admin: SupabaseClient, access: PvuvAccess | null, window: Window): Promise<CollectionStats> {
  const [db, pvuv] = await Promise.all([readDb(admin, window), readPvuv(admin, access, window.range)])
  return { ...db, pvuv }
}
