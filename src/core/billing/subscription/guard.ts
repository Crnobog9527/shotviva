import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { readMirrorRows } from './read-summary'
import { isLiveStatus, type MirrorRow } from './summary'

// One running subscription per account (ARCHITECTURE §6.2: no upgrades or downgrades in v1).
// While a Stripe or Waffo subscription is live — renewing, past due, or cancelled but still in
// its paid period — no membership can be bought, by card or Alipay: that would be a second
// subscription, or a period stacked under one that still bills. Packs are always allowed.
// Found in Codex's #165 validation.

export function blockingSubscription(rows: readonly MirrorRow[]): MirrorRow | null {
  return rows.find((row) => isLiveStatus(row.status)) ?? null
}

export async function assertCanBuy(admin: SupabaseClient, userId: string, product: SiteProduct): Promise<void> {
  if (product.tier === 'pack') return
  // subscriptions_user_id_idx; a handful of rows per user.
  if (blockingSubscription(await readMirrorRows(admin, userId))) {
    throw new AppError('SUBSCRIPTION_EXISTS', 'A subscription is already running on this account')
  }
}
