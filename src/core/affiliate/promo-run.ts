import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// The monthly run of channel partner promotion credits (ARCHITECTURE §6.5 渠道商推广积分, migration
// 1843 partner_promo_run): expires last month's credits and writes each partner's PENDING sheet for
// the month. It grants nothing; an admin confirms each sheet. Safe to re-run.
const summary = z.object({
  period: z.string(),
  expired: z.number().int(),
  taken: z.number().int(),
  lapsed: z.number().int(),
  sheets: z.number().int(),
  pending: z.number().int(),
  failed_orgs: z.array(z.object({ org_id: z.uuid(), error: z.string() })),
  failed_expiries: z.array(z.object({ grant_id: z.number(), error: z.string() })),
})

export type PromoRunSummary = z.infer<typeof summary>

// The UTC month a run is for, `YYYY-MM` (it counts commissions confirmed in the month before).
export const promoPeriod = (now: Date) => now.toISOString().slice(0, 7)

export async function runPartnerPromo(client: RpcClient, period: string): Promise<PromoRunSummary> {
  const parsed = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(period)
  return callRpc(client, 'partner_promo_run', { p_period: parsed }, summary)
}

const expiry = z.object({
  expired: z.number().int(),
  taken: z.number().int(),
  overdue: z.number().int(),
  // A failed top-up's expiry (migration 1847) reports grant_id 0 and its topup_id.
  failed: z.array(z.object({ grant_id: z.number(), topup_id: z.number().optional(), error: z.string() })),
})

export type PromoExpirySummary = z.infer<typeof expiry>

// The daily expiry pass (migration 1843 partner_promo_expire_run, 1847): takes back what is left of
// every grant and top-up whose month is over, and for a week after settles refunds that landed late.
export async function expirePartnerPromo(client: RpcClient): Promise<PromoExpirySummary> {
  return callRpc(client, 'partner_promo_expire_run', {}, expiry)
}
