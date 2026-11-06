import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

// admin_dashboard_stats (0164): one call for every overview card, the trend and the per-model
// breakdown. Revenue is a separate function that arrives with the orders page (T9).

const count = z.coerce.number().int().nonnegative()
// numeric sums come back as JSON numbers.
const dollars = z.coerce.number().nonnegative()
// Succeeded jobs settled before T33 (no usage, no cost), per resolution, to estimate.
const legacy = z.record(z.string(), count)

const windowSchema = z.object({
  key: z.enum(['today', '7d', 'period']),
  since: z.string(),
  signups: count,
  jobs: count,
  succeeded: count,
  failed: count,
  free_credits_used: z.coerce.number().int(),
  paid_credits_used: z.coerce.number().int(),
  new_paying_users: count,
  // T33 (0283): real cost, jobs whose cost could not be worked out, and pre-T33 jobs to estimate.
  cost_usd: dollars,
  uncosted: count,
  legacy,
})

const statsSchema = z.object({
  timezone: z.string(),
  days: z.number().int(),
  generated_at: z.string(),
  windows: z.array(windowSchema),
  trend: z.array(z.object({ day: z.string(), jobs: count, succeeded: count, cost_usd: dollars, legacy })),
  by_model: z.array(
    z.object({
      model: z.string(),
      resolution: z.string(),
      jobs: count,
      succeeded: count,
      cost_usd: dollars,
      uncosted: count,
      legacy: count,
    }),
  ),
})

export type DashboardStats = z.infer<typeof statsSchema>
export type StatsWindow = z.infer<typeof windowSchema>
export type ModelUsage = DashboardStats['by_model'][number]

export const DASHBOARD_DAYS = 30

export function loadDashboardStats(db: RpcClient, days: number = DASHBOARD_DAYS): Promise<DashboardStats> {
  return callRpc(db, 'admin_dashboard_stats', { p_days: days }, statsSchema)
}

// Succeeded among finished jobs; running ones are not counted either way. null with none.
export function successRate(window: Pick<StatsWindow, 'succeeded' | 'failed'>): number | null {
  const finished = window.succeeded + window.failed
  return finished === 0 ? null : window.succeeded / finished
}
