import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

const summary = z.object({ period: z.string(), members: z.number().int(), granted: z.number().int(), short_orgs: z.number().int() })

export type TopupSummary = z.infer<typeof summary>

// The UTC month a top-up run belongs to, `YYYY-MM`.
export const topupPeriod = (now: Date) => now.toISOString().slice(0, 7)

// Tops every active member of every active org up to their monthly allowance for the period
// (ARCHITECTURE §6.5). Safe to re-run: org_monthly_topup records each member once per period.
export async function runMonthlyTopup(client: RpcClient, period: string): Promise<TopupSummary> {
  const parsed = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(period)
  return callRpc(client, 'org_monthly_topup', { p_period: parsed }, summary)
}
