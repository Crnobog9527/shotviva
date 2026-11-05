import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { jobRowSchema, type Job } from './job-schema'
import { isLiveRunning } from './rate-limit'

// What Photos shows, newest first, read with the user's own session (RLS
// generation_jobs_select_own). Failed jobs are refunded and left out; a 'running' row older
// than the function limit died with its function and is left out too (v1 has no sweeper).
export type OwnJobs = { running: Job[]; done: Job[] }

const PHOTOS_LIMIT = 60

export async function listOwnJobs(client: SupabaseClient, userId: string, now: Date): Promise<OwnJobs> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['running', 'succeeded'])
    .order('created_at', { ascending: false })
    .limit(PHOTOS_LIMIT)
  if (error) throw new AppError('INTERNAL', `listOwnJobs failed: ${error.message}`)
  const jobs = data.map((row) => jobRowSchema.parse(row))
  const live = (job: Job) => isLiveRunning({ status: job.status, created_at: job.createdAt.toISOString() }, now)
  return { running: jobs.filter(live), done: jobs.filter((job) => job.status === 'succeeded') }
}
