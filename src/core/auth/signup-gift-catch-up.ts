import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// The daily catch-up of signup gifts the daily cap left pending (migration 2026, ARCHITECTURE §7):
// signup_gift_catch_up pays pending 'daily_cap' accounts through grant_credits' signup branch
// (same ledger key, amount rule, per-network allowance, pause and today's cap), oldest sign-up
// first, at most CATCH_UP_BATCH per run. A pending account is also paid at its next verified
// sign-in on a day with room; this run covers the accounts that do not come back.
export const CATCH_UP_BATCH = 50

const summary = z.object({
  paid: z.number().int(),
  tried: z.number().int(),
  failed: z.number().int(),
  stopped: z.enum(['paused', 'daily_cap']).nullable(),
  remaining: z.number().int(),
})
export type CatchUpSummary = z.infer<typeof summary>

export async function catchUpSignupGifts(client: RpcClient): Promise<CatchUpSummary> {
  return callRpc(client, 'signup_gift_catch_up', { p_limit: CATCH_UP_BATCH }, summary)
}
