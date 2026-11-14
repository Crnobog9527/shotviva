import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import type { Resolution } from '../templates'
import { summarizeDurations, type DurationEstimate } from './duration-summary'

// How long a generation usually takes, for the wait screen's "usually about X s" (no real
// progress comes from the provider: one synchronous call, ARCHITECTURE §4). Measured on real
// jobs: finished_at − created_at of recent succeeded web jobs. The template's own jobs at that
// size first, since they share its model, quality and prompt; a template with too few falls
// back to every web job at that size. Too few there as well: no estimate, the screen keeps its
// generic words rather than inventing a number.
const TEMPLATE_SAMPLE = 40
const SIZE_SAMPLE = 120
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000

type Row = { created_at: string; finished_at: string | null }

const durations = (rows: Row[]) =>
  rows.flatMap((row) => (row.finished_at ? [new Date(row.finished_at).getTime() - new Date(row.created_at).getTime()] : []))

// Template rows: generation_jobs_template_id_idx (a template has few rows next to the table).
// Size rows: generation_jobs_created_at_id_idx read backwards, stopping at SIZE_SAMPLE.
async function recentRows(db: SupabaseClient, resolution: Resolution, since: string, templateId: string | null, limit: number) {
  let query = db
    .from('generation_jobs')
    .select('created_at, finished_at')
    .eq('status', 'succeeded')
    .eq('source', 'web')
    .eq('inputs->>resolution', resolution)
    .gte('created_at', since)
  if (templateId) query = query.eq('template_id', templateId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit).returns<Row[]>()
  if (error) throw new AppError('INTERNAL', `duration estimate failed: ${error.message}`)
  return data
}

export async function loadDurationEstimate(db: SupabaseClient, templateId: string, resolution: Resolution, now = new Date()): Promise<DurationEstimate | null> {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString()
  const own = summarizeDurations(durations(await recentRows(db, resolution, since, templateId, TEMPLATE_SAMPLE)))
  if (own) return own
  return summarizeDurations(durations(await recentRows(db, resolution, since, null, SIZE_SAMPLE)))
}
