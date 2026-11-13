import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

import type { OurDay } from './reconcile'

// Our recorded cost per UTC day, split by who bills us (admin_daily_costs_by_provider, 1360).
// Users' jobs and admin test runs come apart; the test cost is added into cost_usd and also kept
// on its own, the way the page has shown it since T85.

export const COST_PROVIDERS = ['openai', 'openrouter', 'ark'] as const
export type CostProvider = (typeof COST_PROVIDERS)[number]

const count = z.coerce.number().int().nonnegative()
const money = z.coerce.number().nonnegative()
export const providerDaysSchema = z.array(z.object({
  day: z.string(), provider: z.enum(COST_PROVIDERS),
  cost_usd: money, cost_cny: money.default(0), costed: count, uncosted: count, no_usage: count,
  test_cost_usd: money, test_cost_cny: money.default(0), test_runs: count,
}))
type ProviderDayRow = z.infer<typeof providerDaysSchema>[number]

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// The window's UTC days, oldest first, ending today.
export function windowDays(days: number, now = Date.now()): string[] {
  return Array.from({ length: days }, (_, i) => isoDay(now - (days - 1 - i) * 86_400_000))
}

const emptyDay = (day: string): OurDay => ({ day, cost_usd: 0, cost_cny: 0, costed: 0, uncosted: 0, no_usage: 0, test_cost_usd: 0, test_cost_cny: 0, test_runs: 0 })

function toOurDay(row: ProviderDayRow): OurDay {
  return {
    day: row.day, cost_usd: row.cost_usd + row.test_cost_usd, cost_cny: row.cost_cny + row.test_cost_cny,
    costed: row.costed, uncosted: row.uncosted, no_usage: row.no_usage,
    test_cost_usd: row.test_cost_usd, test_cost_cny: row.test_cost_cny, test_runs: row.test_runs,
  }
}

// Every provider gets every day of the window, so the tables line up and empty days show as 0.
export function splitByProvider(rows: readonly ProviderDayRow[], days: readonly string[]): Record<CostProvider, OurDay[]> {
  const found = new Map(rows.map((row) => [`${row.provider}|${row.day}`, row]))
  const of = (provider: CostProvider) => days.map((day) => {
    const row = found.get(`${provider}|${day}`)
    return row ? toOurDay(row) : emptyDay(day)
  })
  return { openai: of('openai'), openrouter: of('openrouter'), ark: of('ark') }
}

export async function loadProviderDailyCosts(db: RpcClient, days: number, now = Date.now()): Promise<Record<CostProvider, OurDay[]>> {
  const rows = await callRpc(db, 'admin_daily_costs_by_provider', { p_days: days }, providerDaysSchema)
  return splitByProvider(rows, windowDays(days, now))
}
