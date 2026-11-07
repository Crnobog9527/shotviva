import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { GenerationSpikeAlert } from './alert-kinds'

// 「出图失败率偏高」 (ARCHITECTURE §16.4): in the last 60 minutes at least 5 failed and at least
// 30% of the finished generations failed. Checked when a generation fails, never on a timer, so
// a quiet site costs nothing. At most one alert per hour: the dedupe key is the UTC hour, so the
// R2 marker lets only the first instance through in that hour.

export const SPIKE_RULE = { windowMinutes: 60, minFailed: 5, minRate: 0.3 } as const

// A sample cap: past this many finished jobs an hour the rate is still read from the newest ones.
const READ_LIMIT = 2000

export type FailureStats = { failed: number; total: number }

const rowsSchema = z.array(z.object({ status: z.enum(['succeeded', 'failed']), error_code: z.string().nullable() }))

// A declined photo or text is the user's input, not an outage (same rule as the Sentry
// generation_failed alert): it counts as finished but not as failed.
export function tally(rows: z.infer<typeof rowsSchema>): FailureStats {
  const failed = rows.filter((row) => row.status === 'failed' && row.error_code !== 'CONTENT_REJECTED').length
  return { failed, total: rows.length }
}

export function isSpike(stats: FailureStats): boolean {
  return stats.failed >= SPIKE_RULE.minFailed && stats.total > 0 && stats.failed / stats.total >= SPIKE_RULE.minRate
}

export function spikeHour(now: Date): string {
  return now.toISOString().slice(0, 13)
}

// One read, two columns, on generation_jobs_created_at_id_idx (created_at range).
export async function readFailureStats(db: SupabaseClient, now: Date): Promise<FailureStats> {
  const since = new Date(now.getTime() - SPIKE_RULE.windowMinutes * 60_000).toISOString()
  const { data, error } = await db
    .from('generation_jobs')
    .select('status, error_code')
    .gte('created_at', since)
    .neq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(READ_LIMIT)
  if (error) throw new Error(`failure stats read failed: ${error.message}`)
  return tally(rowsSchema.parse(data))
}

export function spikeAlert(stats: FailureStats, now: Date): GenerationSpikeAlert {
  return { kind: 'generation_spike', ...stats, windowMinutes: SPIKE_RULE.windowMinutes, hour: spikeHour(now) }
}
