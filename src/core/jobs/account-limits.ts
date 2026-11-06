import 'server-only'

import type { RpcClient } from '../billing'
import { currentTier, limitsFor, type TierLimits } from '../billing/tier'

// The account's tier limits (ARCHITECTURE §6.2 TIER_LIMITS): concurrency Starter 1 / Pro 3 /
// Max 6, perWindow 20 / 40 / 80, batchMax 1 / 10 / 30; no tier counts as Starter. The rate
// limit, the batch check and the workspace all read them here, one current_tier() call each.
// Pass a service-role client: current_tier() is not callable by the client roles.
export async function accountLimits(client: RpcClient, userId: string): Promise<TierLimits> {
  return limitsFor(await currentTier(client, userId))
}
