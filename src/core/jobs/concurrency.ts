import 'server-only'

import type { RpcClient } from '../billing'
import { concurrencyFor, currentTier } from '../billing/tier'

// How many generations one account may run at the same time: by membership tier, Starter 1 /
// Pro 3 / Max 6, no tier 1 (ARCHITECTURE §6.2, current_tier()). The rate limit and the
// workspace both read it here and nowhere else.
// Pass a service-role client: current_tier() is not callable by the client roles.
export type ConcurrencyLimit = (client: RpcClient, userId: string) => Promise<number>

export const concurrencyLimit: ConcurrencyLimit = async (client, userId) =>
  concurrencyFor(await currentTier(client, userId))
