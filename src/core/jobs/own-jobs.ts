import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { JOB_COLUMNS, jobRowSchema, type Job } from './job-schema'
import { isLiveRunning, RATE_LIMIT } from './rate-limit'

// Photos reads on the server: the raw row may contain private template references.
// Scope every query to the signed-in owner and undeleted works. A 'running' row older
// than the function limit died with its function and is left out too (v1 has no sweeper).
// Photos shows the newest PHOTOS_PAGE works and pages back from there (2026-11-27: the list
// used to stop at the newest 60). `until` is the last row the page already showed: the list is
// everything from the newest down to it plus the next page, keyset on (created_at, id) desc, no
// OFFSET. Served by generation_jobs_user_id_created_at_idx (user_id, created_at desc).
// next: the cursor for "Load more", null at the oldest work. total: every finished work.
export type OwnJobs = { running: Job[]; done: Job[]; total: number; next: OwnJobsCursor | null }
export type OwnJobsCursor = { createdAt: string; id: string }

export const PHOTOS_PAGE = 48
// At most this many works above the cursor are listed again: past it the list slides (the
// newest drop off the top, read nearest the cursor first), so Load more always moves on.
const MAX_WINDOW = 1000
// Far above any tier's concurrency (TIER_LIMITS): only the count matters.
const RUNNING_LIMIT = 30

const LISTED = ['running', 'succeeded']
// created_at is matched as the raw timestamptz text the row came with (microseconds; a JS Date
// keeps milliseconds only), quoted for PostgREST's or().
const atOrAfter = (c: OwnJobsCursor) => `created_at.gt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.gte.${c.id})`
const before = (c: OwnJobsCursor) => `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`

type Row = Record<string, unknown> & { id: string; created_at: string }

// Photos' filter (作品页改版 PR③): one root template category, or the works that carry a
// watermark. One at a time. Under a filter the list is finished works only (none developing).
export type OwnJobsFilter = { category: string } | { watermarked: true }

const FILTER_KEY = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

// From the address (?category=, ?mark=watermark); anything else is no filter.
export function ownJobsFilterFrom(category: unknown, mark: unknown): OwnJobsFilter | null {
  if (typeof category === 'string' && category.length <= 64 && FILTER_KEY.test(category)) return { category }
  return mark === 'watermark' ? { watermarked: true } : null
}

// Under a filter the rows come from own_photos_filtered (migration 2039), which takes the cursor
// and the limit itself and reads one page through the same index; it returns generation_jobs rows.
const filterArgs = (userId: string, filter: OwnJobsFilter) =>
  'category' in filter ? { p_user: userId, p_category: filter.category } : { p_user: userId, p_watermarked: true }

type Read = PromiseLike<{ data: unknown; error: { message: string } | null }>
const rowsOf = async (query: Read, what: string): Promise<Row[]> => {
  const { data, error } = await query
  if (error) throw new AppError('INTERNAL', `${what} failed: ${error.message}`)
  return data as Row[]
}

// The two reads of a list: the window from the cursor up to the newest (oldest first), and the
// page below the cursor (newest first), one row more than a page to know whether more remain.
function pageReads(client: SupabaseClient, userId: string, until: OwnJobsCursor | null, window: number, filter: OwnJobsFilter | null): [Read | null, Read] {
  if (filter) {
    const args = filterArgs(userId, filter)
    const rpc = (more: Record<string, unknown>) => client.rpc('own_photos_filtered', { ...args, ...more }).select(JOB_COLUMNS)
    return [
      until ? rpc({ p_limit: window, p_from_at: until.createdAt, p_from_id: until.id }) : null,
      rpc({ p_limit: PHOTOS_PAGE + 1, ...(until ? { p_before_at: until.createdAt, p_before_id: until.id } : {}) }),
    ]
  }
  const base = (ascending = false) =>
    client
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', userId)
      .in('status', LISTED)
      .is('deleted_at', null).is('org_access_ended_at', null)
      .order('created_at', { ascending })
      .order('id', { ascending })
  return [until ? base(true).or(atOrAfter(until)).limit(window) : null, (until ? base().or(before(until)) : base()).limit(PHOTOS_PAGE + 1)]
}

// filter: the list narrowed (finished works only). total stays every finished work, whatever the
// filter; how many the filter holds is listOwnPhotoCategories' count.
export async function listOwnJobs(client: SupabaseClient, userId: string, now: Date, until: OwnJobsCursor | null = null, window = MAX_WINDOW, filter: OwnJobsFilter | null = null): Promise<OwnJobs> {
  const [up, down] = pageReads(client, userId, until, window, filter)
  const [above, page, total] = await Promise.all([
    up ? rowsOf(up, 'listOwnJobs') : Promise.resolve([] as Row[]),
    rowsOf(down, 'listOwnJobs'),
    countDone(client, userId),
  ])
  // The function answers a union: put each read in its own order whatever came back.
  const newestFirst = (x: Row, y: Row) => (x.created_at === y.created_at ? (x.id < y.id ? 1 : -1) : x.created_at < y.created_at ? 1 : -1)
  if (filter) {
    above.sort((x, y) => -newestFirst(x, y))
    page.sort(newestFirst)
  }
  // next always comes from the page below the cursor, so each Load more moves one page on.
  const below = page.slice(0, PHOTOS_PAGE)
  const rows = [...above.reverse(), ...below]
  const last = below.at(-1)
  const next = page.length > PHOTOS_PAGE && last ? { createdAt: last.created_at, id: last.id } : null
  const listed = rows.map((row) => jobRowSchema.parse(row))
  // Cut at either end (more below, or the window full above): a batch may straddle the cut.
  const cut = next !== null || above.length >= window
  const jobs = cut ? await withWholeBatches(client, userId, listed, filter) : listed
  const live = (job: Job) => isLiveRunning({ status: job.status, created_at: job.createdAt.toISOString() }, now)
  return { running: jobs.filter(live), done: jobs.filter((job) => job.status === 'succeeded'), total, next }
}

async function countDone(client: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await client
    .from('generation_jobs')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .is('deleted_at', null).is('org_access_ended_at', null)
    .limit(1)
  if (error) throw new AppError('INTERNAL', `listOwnJobs count failed: ${error.message}`)
  return count ?? 0
}

// "Load more"'s address carries the cursor: base64url of `<created_at>|<id>`. Anything that does
// not decode to a timestamp and a uuid is no cursor (the first page).
const CURSOR_ID = z.uuid()
const CURSOR_AT = z.iso.datetime({ offset: true })

export function encodeOwnJobsCursor(cursor: OwnJobsCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString('base64url')
}

export function decodeOwnJobsCursor(value: unknown): OwnJobsCursor | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null
  const [createdAt, id, ...rest] = Buffer.from(value, 'base64url').toString('utf8').split('|')
  if (rest.length > 0 || !CURSOR_AT.safeParse(createdAt).success || !CURSOR_ID.safeParse(id).success) return null
  return { createdAt: createdAt!, id: id!.toLowerCase() }
}

// A batch cut by the page window (its older photos past the cut) would show fewer photos and
// a smaller ZIP count than it has (T107): its missing finished photos are read in too, one
// query over generation_jobs_batch_slot. A batch is at most 30 photos. The next page then
// leaves them out (Photos drops a work it already shows). Under a filter, only the batch's
// photos the filter keeps.
async function withWholeBatches(client: SupabaseClient, userId: string, jobs: Job[], filter: OwnJobsFilter | null = null): Promise<Job[]> {
  const batchIds = [...new Set(jobs.flatMap((job) => (job.batchId ? [job.batchId] : [])))]
  if (batchIds.length === 0) return jobs
  const query: Read = filter
    ? client.rpc('own_photos_filtered', { ...filterArgs(userId, filter), p_batches: batchIds, p_limit: MAX_WINDOW }).select(JOB_COLUMNS)
    : client
        .from('generation_jobs')
        .select(JOB_COLUMNS)
        .eq('user_id', userId)
        .in('batch_id', batchIds)
        .eq('status', 'succeeded')
        .is('deleted_at', null).is('org_access_ended_at', null)
  const data = await rowsOf(query, 'listOwnJobs batches')
  const seen = new Set(jobs.map((job) => job.id))
  return [...jobs, ...data.map((row) => jobRowSchema.parse(row)).filter((job) => !seen.has(job.id))]
}

// What the filter offers: each category the user has finished works in (an edit counts with the
// work it was made from), how many, and how many of them carry a watermark. Built-in categories
// (system: an edit whose original is gone) come too, so `works` adds up to every finished work.
export type OwnPhotoCategory = { key: string; nameEn: string; nameZh: string; system: boolean; works: number; watermarked: number }

const categoryRows = z.array(z.object({
  category_key: z.string(), name_en: z.string(), name_zh: z.string(), is_system: z.boolean(),
  works: z.number().int(), watermarked: z.number().int(),
}))

export async function listOwnPhotoCategories(client: SupabaseClient, userId: string): Promise<OwnPhotoCategory[]> {
  const { data, error } = await client.rpc('own_photo_categories', { p_user: userId })
  if (error) throw new AppError('INTERNAL', `listOwnPhotoCategories failed: ${error.message}`)
  return categoryRows.parse(data).map((row) => ({ key: row.category_key, nameEn: row.name_en, nameZh: row.name_zh, system: row.is_system, works: row.works, watermarked: row.watermarked }))
}

// The company view of Photos (core/org/works/photos.ts) lists other people's works too; the
// reader's own ones among them are read here in full, so they behave as on the personal page
// (batch groups, the viewer, Make again). Owner-scoped like every read in this file: an id that is
// not the user's finished, undeleted, still-accessible work is simply not returned. A batch of
// theirs cut by the page (or by the window above the cursor) comes whole, as on the personal page
// (T107): its other finished photos are returned too, after the ones asked for.
export async function ownJobsByIds(client: SupabaseClient, userId: string, ids: readonly string[]): Promise<Job[]> {
  if (ids.length === 0) return []
  const { data, error } = await client
    .from('generation_jobs')
    .select(JOB_COLUMNS)
    .eq('user_id', userId)
    .in('id', [...ids])
    .eq('status', 'succeeded')
    .is('deleted_at', null).is('org_access_ended_at', null)
  if (error) throw new AppError('INTERNAL', `ownJobsByIds failed: ${error.message}`)
  return withWholeBatches(client, userId, data.map((row) => jobRowSchema.parse(row)))
}

// The user's photos in flight, as rows (the company view's "In progress"; the personal page gets
// them from listOwnJobs).
export async function listOwnRunning(client: SupabaseClient, userId: string, now: Date): Promise<Job[]> {
  const since = new Date(now.getTime() - RATE_LIMIT.RUNNING_STALE_MS).toISOString()
  const { data, error } = await client
    .from('generation_jobs')
    .select(JOB_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'running')
    .is('deleted_at', null).is('org_access_ended_at', null)
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(RUNNING_LIMIT)
  if (error) throw new AppError('INTERNAL', `listOwnRunning failed: ${error.message}`)
  return data.map((row) => jobRowSchema.parse(row))
}

// The ids of the user's photos in flight, for the concurrency check of the creation dialog on
// Create (T38): ids and times only, the running rows younger than the function limit. Served
// by generation_jobs_user_id_created_at_idx (user_id, created_at desc).
export async function listRunningJobIds(client: SupabaseClient, userId: string, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - RATE_LIMIT.RUNNING_STALE_MS).toISOString()
  const { data, error } = await client
    .from('generation_jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'running')
    .is('deleted_at', null).is('org_access_ended_at', null)
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(RUNNING_LIMIT)
  if (error) throw new AppError('INTERNAL', `listRunningJobIds failed: ${error.message}`)
  return data.map((row) => row.id as string)
}

export type MonthWorks = { ids: string[]; count: number }

// The account page's film strip (comps-v3-b/account.html): this calendar month's finished,
// not deleted works, newest first, the first `limit` ids plus how many there are in all. One
// query on generation_jobs_user_id_created_at_idx (user_id, created_at desc), with the count
// taken in the same round trip.
export async function listMonthWorks(client: SupabaseClient, userId: string, now: Date, limit: number): Promise<MonthWorks> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { data, error, count } = await client
    .from('generation_jobs')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .is('deleted_at', null).is('org_access_ended_at', null)
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new AppError('INTERNAL', `listMonthWorks failed: ${error.message}`)
  const ids = data.map((row) => row.id as string)
  return { ids, count: count ?? ids.length }
}
