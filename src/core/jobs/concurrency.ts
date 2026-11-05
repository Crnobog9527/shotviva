import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { RATE_LIMIT } from './rate-limit'

// How many generations one account may run at the same time. The rate limit and the
// workspace both read it here and nowhere else, so T9 can swap the body for the tier rule
// (current_tier(): Starter 1 / Pro 3 / Max 6, ARCHITECTURE §6.2) without touching callers.
// Until then every account gets today's single limit.
export type ConcurrencyLimit = (client: SupabaseClient, userId: string) => Promise<number>

export const concurrencyLimit: ConcurrencyLimit = async () => RATE_LIMIT.MAX_RUNNING
