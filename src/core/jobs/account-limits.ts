import 'server-only'

import type { RpcClient } from '../billing'
import { effectiveTier, limitsFor, type TierLimits } from '../billing/tier'

// The account's tier limits (ARCHITECTURE §6.2 TIER_LIMITS): concurrency Starter 1 / Pro 3 /
// Max 6, perWindow 20 / 40 / 80, batchMax 1 / 10 / 30; no tier counts as Starter. The rate
// limit, the batch check and the workspace all read them here, one effective_tier() call each
// (an unbanned admin counts as Max). Pass a service-role client: effective_tier() is not
// callable by the client roles.
export async function accountLimits(client: RpcClient, userId: string): Promise<TierLimits> {
  return limitsFor(await effectiveTier(client, userId))
}
