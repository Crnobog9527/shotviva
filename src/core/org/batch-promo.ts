import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/core/logger'

// Batch create with promotion credits (Owner 2026-11-28, migration 2034): only an active member of
// an active org that runs the enterprise affiliate program may make 1K batch cells, paid from the
// org's promotion share. Mirrors public._batch_promo_allowed, which reserve_batch_cell enforces;
// this read only lets the preflight and the page say so first. Service role: org_members has no
// client grant. A failed read is a no (the paid-only batch everyone else has).
export async function readBatchPromoAllowed(db: SupabaseClient, user: string): Promise<boolean> {
  const { data, error } = await db
    .from('org_members')
    .select('orgs!inner(status,affiliate_enabled)')
    .eq('user_id', user)
    .eq('status', 'active')
    .eq('orgs.status', 'active')
    .eq('orgs.affiliate_enabled', true)
    .maybeSingle()
  if (error) {
    logger.warn('batch promo unavailable', { code: error.code })
    return false
  }
  return data !== null
}
