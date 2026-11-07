import type { SupabaseClient } from '@supabase/supabase-js'

import type { GenerationSpikeAlert } from './alert-kinds'

// 「出图失败率偏高」 (ARCHITECTURE §16.4): in the last 60 minutes at least 5 failed and at least
// 30% of the finished generations failed. Checked after a generation fails, in after() work (never
// on the request path), at most once a minute per instance, and not at all while the last alert
// is under an hour old. At most one alert per hour, sliding from the last one (the R2 mark).

export const SPIKE_RULE = { windowMinutes: 60, minFailed: 5, minRate: 0.3 } as const

export const LOOKUP_TIMEOUT_MS = 2000

export type FailureStats = { failed: number; total: number }

export function isSpike(stats: FailureStats): boolean {
  return stats.failed >= SPIKE_RULE.minFailed && stats.total > 0 && stats.failed / stats.total >= SPIKE_RULE.minRate
}

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>

async function counted(query: CountQuery): Promise<number> {
  const { count, error } = await query
  if (error || count === null) throw new Error(`failure stats count failed: ${error?.message ?? 'no count'}`)
  return count
}

// Two counts over the last hour on generation_jobs_created_at_id_idx (a created_at range, so the
// work is bounded by an hour of jobs), no rows transferred. A declined photo or text is the user's
// input, not an outage (same rule as the Sentry generation_failed alert): finished, not failed.
export async function readFailureStats(db: SupabaseClient, nowMs: number): Promise<FailureStats> {
  const since = new Date(nowMs - SPIKE_RULE.windowMinutes * 60_000).toISOString()
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
  const jobs = () => db.from('generation_jobs').select('id', { count: 'exact' }).gte('created_at', since)
  const [total, failed] = await Promise.all([
    counted(jobs().neq('status', 'running').limit(1).abortSignal(signal)),
    counted(jobs().eq('status', 'failed').or('error_code.is.null,error_code.neq.CONTENT_REJECTED').limit(1).abortSignal(signal)),
  ])
  return { failed, total }
}

export function spikeAlert(stats: FailureStats): GenerationSpikeAlert {
  return { kind: 'generation_spike', ...stats, windowMinutes: SPIKE_RULE.windowMinutes }
}
