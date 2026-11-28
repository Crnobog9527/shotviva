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

export async function listOwnJobs(client: SupabaseClient, userId: string, now: Date, until: OwnJobsCursor | null = null, window = MAX_WINDOW): Promise<OwnJobs> {
  const base = (ascending = false) =>
    client
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', userId)
      .in('status', LISTED)
      .is('deleted_at', null).is('org_access_ended_at', null)
      .order('created_at', { ascending })
      .order('id', { ascending })
  const read = async (query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> => {
    const { data, error } = await query
    if (error) throw new AppError('INTERNAL', `listOwnJobs failed: ${error.message}`)
    return data as Row[]
  }
  const [above, page, total] = await Promise.all([
    until ? read(base(true).or(atOrAfter(until)).limit(window)) : Promise.resolve([] as Row[]),
    read((until ? base().or(before(until)) : base()).limit(PHOTOS_PAGE + 1)),
    countDone(client, userId),
  ])
  // next always comes from the page below the cursor, so each Load more moves one page on.
  const below = page.slice(0, PHOTOS_PAGE)
  const rows = [...above.reverse(), ...below]
  const last = below.at(-1)
  const next = page.length > PHOTOS_PAGE && last ? { createdAt: last.created_at, id: last.id } : null
  const listed = rows.map((row) => jobRowSchema.parse(row))
  // Cut at either end (more below, or the window full above): a batch may straddle the cut.
  const cut = next !== null || above.length >= window
  const jobs = cut ? await withWholeBatches(client, userId, listed) : listed
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
// leaves them out (Photos drops a work it already shows).
async function withWholeBatches(client: SupabaseClient, userId: string, jobs: Job[]): Promise<Job[]> {
  const batchIds = [...new Set(jobs.flatMap((job) => (job.batchId ? [job.batchId] : [])))]
  if (batchIds.length === 0) return jobs
  const { data, error } = await client
    .from('generation_jobs')
    .select(JOB_COLUMNS)
    .eq('user_id', userId)
    .in('batch_id', batchIds)
    .eq('status', 'succeeded')
    .is('deleted_at', null).is('org_access_ended_at', null)
  if (error) throw new AppError('INTERNAL', `listOwnJobs batches failed: ${error.message}`)
  const seen = new Set(jobs.map((job) => job.id))
  return [...jobs, ...data.map((row) => jobRowSchema.parse(row)).filter((job) => !seen.has(job.id))]
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
