import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { PoolChoiceOffer } from '@/core/billing/pools'
import { logger } from '@/core/logger'

// 出图时让员工自选 (ARCHITECTURE §6.5, migration 1897): whether the signed-in account holds both
// kinds of org credits right now (a paid share and a live promotion share), as reserve_credits
// decides it, and their last choice. null: no choice to offer (the page shows no picker and the
// server keeps paid first, then free). Read with the service role: org_members has no client grant.
const seat = z.object({
  held_credits: z.number(),
  held_promo_credits: z.number(),
  orgs: z.object({ promo_expires_at: z.string().nullable() }),
})
const profile = z.object({ credits: z.number(), free_credits: z.number(), org_pool_choice: z.enum(['paid', 'promo']).nullable() })

// Mirrors _reserve_pool: both shares held while the promotion month is live.
export function offerOf(s: z.infer<typeof seat>, b: z.infer<typeof profile>, now: Date): PoolChoiceOffer | null {
  const expires = s.orgs.promo_expires_at
  const live = expires !== null && Date.parse(expires) > now.getTime()
  const both = live && Math.min(s.held_credits, b.credits) > 0 && Math.min(s.held_promo_credits, b.free_credits) > 0
  return both ? { paid: b.credits, promo: b.free_credits, last: b.org_pool_choice ?? 'paid' } : null
}

export async function readPoolChoiceOffer(db: SupabaseClient, user: string, now = new Date()): Promise<PoolChoiceOffer | null> {
  try {
    const [m, p] = await Promise.all([
      db.from('org_members').select('held_credits,held_promo_credits,orgs!inner(promo_expires_at)').eq('user_id', user).eq('status', 'active').maybeSingle(),
      db.from('profiles').select('credits,free_credits,org_pool_choice').eq('id', user).maybeSingle(),
    ])
    if (m.error || p.error || !m.data || !p.data) return null
    return offerOf(seat.parse(m.data), profile.parse(p.data), now)
  } catch (error) {
    logger.warn('pool choice unavailable', { code: error instanceof Error ? error.name : 'UNKNOWN' })
    return null
  }
}
