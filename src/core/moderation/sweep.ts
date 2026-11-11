import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { SCREEN_COLUMNS, screenRowSchema, screenWork, type ModerationDeps } from './moderate-work'

// The 10-minute sweep (ARCHITECTURE §9 第 5 条): public works the screen has not seen yet, never
// tried first, then the least recently tried, at most 50 a run. It backfills the public works
// made before T108 and retries failed screens, but a failure waits RETRY_AFTER_MINUTES and a work
// is given up after MAX_SCREEN_ATTEMPTS (it stays pending for a person), so works that always
// fail cannot starve the rest or burn the rate limit. Works outside the gallery's scope are
// skipped. Reads generation_jobs_screen_sweep_idx.
//
// Worst case per run: 50 works, 5 at a time, each bounded by the 20 s API timeout = 200 s, inside
// the route's 300 s maxDuration.
export const SWEEP_LIMIT = 50
export const MAX_SCREEN_ATTEMPTS = 5
export const RETRY_AFTER_MINUTES = 30
const CONCURRENCY = 5

export async function pendingScreens(db: SupabaseClient, limit = SWEEP_LIMIT, now = new Date()) {
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MINUTES * 60_000).toISOString()
  const { data, error } = await db
    .from('generation_jobs')
    .select(SCREEN_COLUMNS)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'pending')
    .is('deleted_at', null)
    .is('auto_moderated_at', null)
    .lt('screen_attempts', MAX_SCREEN_ATTEMPTS)
    .or(`last_screen_at.is.null,last_screen_at.lt.${retryBefore}`)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
    .neq('template_id', 'edit')
    .order('last_screen_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new AppError('INTERNAL', 'moderation sweep read failed', { cause: new Error(error.message) })
  return z.array(screenRowSchema).parse(data)
}

export type SweepResult = { seen: number; screened: number }

export async function sweepModeration(deps: ModerationDeps & { db: SupabaseClient }, limit = SWEEP_LIMIT): Promise<SweepResult> {
  if (!deps.screen) return { seen: 0, screened: 0 }
  const rows = await pendingScreens(deps.db, limit)
  let screened = 0
  for (let start = 0; start < rows.length; start += CONCURRENCY) {
    const results = await Promise.all(rows.slice(start, start + CONCURRENCY).map((row) => screenWork(deps, row)))
    screened += results.filter((status) => status !== 'skipped').length
  }
  return { seen: rows.length, screened }
}
