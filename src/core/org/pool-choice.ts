import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { PoolChoiceOffer } from '@/core/billing/pools'
import { logger } from '@/core/logger'

// 在职成员只用企业积分、出图时自选 (ARCHITECTURE §6.5, migration 1897): for an active member of an org,
// the org's paid and promotion shares they can spend (their own credits are frozen) and their last
// choice; null for everyone else (their own balance applies). Read with the service role:
// org_members has no client grant.
const seat = z.object({
  held_credits: z.number(),
  held_promo_credits: z.number(),
  orgs: z.object({ promo_expires_at: z.string().nullable() }),
})
const profile = z.object({ credits: z.number(), free_credits: z.number(), org_pool_choice: z.enum(['paid', 'promo']).nullable() })

// Mirrors _reserve_pool: an active member spends only the org's shares (paid, and promotion while
// the month is live); the picker shows when both are above 0.
export function offerOf(s: z.infer<typeof seat>, b: z.infer<typeof profile>, now: Date): PoolChoiceOffer {
  const expires = s.orgs.promo_expires_at
  const live = expires !== null && Date.parse(expires) > now.getTime()
  return { paid: Math.min(s.held_credits, b.credits), promo: live ? Math.min(s.held_promo_credits, b.free_credits) : 0, last: b.org_pool_choice ?? 'paid' }
}

export async function readPoolChoiceOffer(db: SupabaseClient, user: string, now = new Date()): Promise<PoolChoiceOffer | null> {
  try {
    const [m, p] = await Promise.all([
      db.from('org_members').select('held_credits,held_promo_credits,orgs!inner(promo_expires_at)').eq('user_id', user).eq('status', 'active').eq('role', 'member').maybeSingle(),
      db.from('profiles').select('credits,free_credits,org_pool_choice').eq('id', user).maybeSingle(),
    ])
    if (m.error || p.error || !m.data || !p.data) return null
    return offerOf(seat.parse(m.data), profile.parse(p.data), now)
  } catch (error) {
    logger.warn('pool choice unavailable', { code: error instanceof Error ? error.name : 'UNKNOWN' })
    return null
  }
}
