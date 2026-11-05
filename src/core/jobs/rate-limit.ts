import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { concurrencyLimit } from './concurrency'

// Per-account limit on generation (AGENTS §6: Vercel Firewall limits by IP in front of
// this). Deliberately simple: counted from generation_jobs, no extra table or service.
//   - at most concurrencyLimit() jobs in flight per account (by membership tier)
//   - at most MAX_PER_WINDOW jobs started per WINDOW_MS
// Two requests racing can both pass; credits are still reserved atomically, so the worst
// case is one extra provider call, not free images. The partner route (T7) reuses this.
export const RATE_LIMIT = {
  MAX_PER_WINDOW: 20,
  WINDOW_MS: 10 * 60 * 1000,
  // A job still 'running' after the 300s function limit died with its function (v1 has no
  // sweeper); stop counting it so it cannot lock the account forever.
  RUNNING_STALE_MS: 6 * 60 * 1000,
} as const

type RecentJob = { status: string; created_at: string }

// A 'running' row younger than the function limit is really in flight.
export function isLiveRunning(job: RecentJob, now: Date): boolean {
  return job.status === 'running' && now.getTime() - new Date(job.created_at).getTime() < RATE_LIMIT.RUNNING_STALE_MS
}

export function rateLimitVerdict(
  recent: RecentJob[],
  now: Date,
  maxRunning: number,
): 'ok' | 'too_many_running' | 'too_many_recent' {
  const running = recent.filter((job) => isLiveRunning(job, now))
  if (running.length >= maxRunning) return 'too_many_running'
  if (recent.length >= RATE_LIMIT.MAX_PER_WINDOW) return 'too_many_recent'
  return 'ok'
}

// jobId: a request that names its job (web retries, partner Idempotency-Key) is a replay of that
// one job, so its own row never counts against it; concurrent replays then settle as one job
// instead of rate-limiting each other once the limit is 1.
export async function assertWithinRateLimit(
  client: SupabaseClient,
  userId: string,
  now: Date,
  jobId?: string,
): Promise<void> {
  const since = new Date(now.getTime() - RATE_LIMIT.WINDOW_MS).toISOString()
  const { data, error } = await client
    .from('generation_jobs')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(RATE_LIMIT.MAX_PER_WINDOW)
    .returns<(RecentJob & { id: string })[]>()
  if (error) throw new AppError('INTERNAL', `rate limit lookup failed: ${error.message}`)
  const others = data.filter((job) => job.id !== jobId)
  const verdict = rateLimitVerdict(others, now, await concurrencyLimit(client, userId))
  if (verdict === 'too_many_running') throw new AppError('RATE_LIMITED', 'Wait for one of your photos to finish')
  if (verdict === 'too_many_recent') throw new AppError('RATE_LIMITED', 'Too many images in a short time; try again in a few minutes')
}
