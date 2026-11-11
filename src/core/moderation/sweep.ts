import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { SCREEN_COLUMNS, screenRowSchema, screenWork, type ModerationDeps } from './moderate-work'

// The 10-minute sweep (ARCHITECTURE §9 第 5 条): public works the screen has not seen yet, oldest
// first, at most 100 a run. It retries works whose first screen failed and backfills the public
// works made before T108. Partner and freeform works never reach the gallery, so they are skipped.
// Reads generation_jobs_moderation_queue_idx.

export const SWEEP_LIMIT = 100
const CONCURRENCY = 5

export async function pendingScreens(db: SupabaseClient, limit = SWEEP_LIMIT) {
  const { data, error } = await db
    .from('generation_jobs')
    .select(SCREEN_COLUMNS)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'pending')
    .is('deleted_at', null)
    .is('auto_moderated_at', null)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
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
