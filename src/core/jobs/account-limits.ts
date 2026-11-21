import 'server-only'

import type { RpcClient } from '../billing'
import { effectiveLimits, type EffectiveLimits } from '../billing/tier'

// The account's limits: SQL effective_limits() (ARCHITECTURE §6.5), the tier table (§6.2
// TIER_LIMITS: concurrency Starter 1 / Pro 3 / Max 6, perWindow 20 / 40 / 80, batchMax 1 / 10 /
// 30; an unbanned admin counts as Max) with each item lifted to the account's org value when it
// is an active member of an active org. The rate limit, the batch check and the workspace all
// read them here, one RPC each. Pass a service-role client: effective_limits() is not callable by
// the client roles.
export async function accountLimits(client: RpcClient, userId: string): Promise<EffectiveLimits> {
  return effectiveLimits(client, userId)
}
