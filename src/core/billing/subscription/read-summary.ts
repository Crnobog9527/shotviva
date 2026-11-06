import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { currentTier } from '../tier'
import { summarizeSubscription, type MirrorRow, type SubscriptionSummary } from './summary'

// subscriptions is private (service role only, 0081), so the account page reads it with the
// admin client, filtered to the signed-in user. Index: subscriptions_user_id_idx. A user has a
// handful of rows at most (one per subscription ever started), so no page is needed.

const rowSchema = z.object({
  stripe_subscription_id: z.string(),
  product_id: z.string(),
  status: z.string(),
  current_period_end: z.string(),
  cancel_at_period_end: z.boolean(),
})

const MIRROR_COLUMNS = 'stripe_subscription_id, product_id, status, current_period_end, cancel_at_period_end'

export async function readMirrorRows(admin: SupabaseClient, userId: string): Promise<MirrorRow[]> {
  const { data, error } = await admin.from('subscriptions').select(MIRROR_COLUMNS).eq('user_id', userId).limit(20)
  if (error) throw new AppError('INTERNAL', `readMirrorRows failed: ${error.message}`)
  return z
    .array(rowSchema)
    .parse(data ?? [])
    .map((row) => ({
      stripeSubscriptionId: row.stripe_subscription_id,
      productId: row.product_id,
      status: row.status,
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAtPeriodEnd: row.cancel_at_period_end,
    }))
}

async function readPaidUntil(admin: SupabaseClient, userId: string): Promise<Date | null> {
  const { data, error } = await admin.from('profiles').select('paid_until').eq('id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', `readPaidUntil failed: ${error.message}`)
  const value = z.object({ paid_until: z.string().nullable() }).nullable().parse(data)?.paid_until
  return value ? new Date(value) : null
}

// Three reads in parallel, no writes: the mirror, paid_until (profiles primary key) and
// current_tier (credit_ledger_user_id_created_at_idx).
export async function readSubscriptionSummary(
  admin: SupabaseClient,
  userId: string,
  products: readonly SiteProduct[],
): Promise<SubscriptionSummary> {
  const [rows, paidUntil, tier] = await Promise.all([
    readMirrorRows(admin, userId),
    readPaidUntil(admin, userId),
    currentTier(admin, userId),
  ])
  return summarizeSubscription({ rows, paidUntil, tier, products, now: new Date() })
}
