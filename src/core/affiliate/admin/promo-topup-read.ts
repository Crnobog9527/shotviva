import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked } from './read'

// Reads for ad-hoc top-ups (ARCHITECTURE §6.5 渠道商推广积分「临时追加」, table of migration 1845).

const int = z.coerce.number().int()
const topup = z.object({
  id: z.coerce.string(),
  org_id: z.uuid(),
  period: z.string(),
  recipient_user_id: z.uuid(),
  credits: int,
  reason: z.string(),
  created_by: z.uuid(),
  created_at: z.string(),
  expires_at: z.string(),
  expired_credits: int.nullable(),
})
export type PromoTopup = z.infer<typeof topup>

/** The latest top-ups, newest month first (partner_promo_topups_list_idx); a few per partner and month. */
export async function promoTopups(db: SupabaseClient, limit = 200): Promise<PromoTopup[]> {
  const rows = checked(
    await db
      .from('partner_promo_topups')
      .select('id,org_id,period,recipient_user_id,credits,reason,created_by,created_at,expires_at,expired_credits')
      .order('period', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
  )
  return z.array(topup).parse(rows)
}

/** The top-ups of one partner and month, and their sum. */
export function topupsOf(topups: PromoTopup[], orgId: string, period: string) {
  const list = topups.filter((t) => t.org_id === orgId && t.period === period)
  return { list, sum: list.reduce((total, t) => total + t.credits, 0) }
}

/** The current UTC month, `YYYY-MM` (the month a top-up is for and expires at the end of). */
export function currentPeriod(now: Date): string {
  return now.toISOString().slice(0, 7)
}
