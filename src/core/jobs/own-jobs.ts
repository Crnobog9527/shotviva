import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { jobRowSchema, type Job } from './job-schema'
import { isLiveRunning, RATE_LIMIT } from './rate-limit'

// What Photos shows, newest first, read with the user's own session (RLS
// generation_jobs_select_own, which also hides works the user deleted, T41). Failed jobs are refunded and left out; a 'running' row older
// than the function limit died with its function and is left out too (v1 has no sweeper).
export type OwnJobs = { running: Job[]; done: Job[] }

const PHOTOS_LIMIT = 60
// Far above any tier's concurrency (TIER_LIMITS): only the count matters.
const RUNNING_LIMIT = 30

export async function listOwnJobs(client: SupabaseClient, userId: string, now: Date): Promise<OwnJobs> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['running', 'succeeded'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PHOTOS_LIMIT)
  if (error) throw new AppError('INTERNAL', `listOwnJobs failed: ${error.message}`)
  const jobs = data.map((row) => jobRowSchema.parse(row))
  const live = (job: Job) => isLiveRunning({ status: job.status, created_at: job.createdAt.toISOString() }, now)
  return { running: jobs.filter(live), done: jobs.filter((job) => job.status === 'succeeded') }
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
    .is('deleted_at', null)
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new AppError('INTERNAL', `listMonthWorks failed: ${error.message}`)
  const ids = data.map((row) => row.id as string)
  return { ids, count: count ?? ids.length }
}
