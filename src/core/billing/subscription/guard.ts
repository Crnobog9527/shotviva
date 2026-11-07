import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProductId, SiteProduct } from '../../config'
import { AppError } from '../../errors'
import type { RpcClient } from '../rpc'
import { currentTier } from '../tier'
import { readMirrorRows } from './read-summary'
import { isLiveStatus, type MirrorRow } from './summary'
import { membershipRank, purchaseVerdict, type MemberStanding, type PurchaseVerdict } from './upgrade-rule'

// The checkout guard (ARCHITECTURE §6.2 「升级」, T66; before it, any membership while a
// subscription ran was refused, found in Codex's #165 validation). A higher plan is an upgrade;
// the same plan or a lower one while a membership runs is 409 DOWNGRADE_NOT_ALLOWED, on every
// route (Managed Payments card, 中国银行卡, Alipay, Waffo). Packs are always allowed.

// The highest-ranked subscription Stripe or Waffo may still bill or whose paid period still runs.
export function heldSubscription(rows: readonly MirrorRow[]): ProductId | null {
  let held: ProductId | null = null
  for (const row of rows) {
    const id = row.productId as ProductId
    if (!isLiveStatus(row.status) || membershipRank(id) < 0) continue
    if (held === null || membershipRank(id) > membershipRank(held)) held = id
  }
  return held
}

// Two reads in parallel: the mirror (subscriptions_user_id_idx, a handful of rows) and
// current_tier (credit_ledger_user_id_created_at_idx).
export async function readStanding(admin: SupabaseClient & RpcClient, userId: string): Promise<MemberStanding> {
  const [rows, tier] = await Promise.all([readMirrorRows(admin, userId), currentTier(admin, userId)])
  return { subscription: heldSubscription(rows), tier }
}

export async function assertCanBuy(admin: SupabaseClient & RpcClient, userId: string, product: SiteProduct): Promise<PurchaseVerdict> {
  if (product.tier === 'pack') return 'buy'
  const verdict = purchaseVerdict(await readStanding(admin, userId), product.id)
  if (verdict === 'blocked') {
    throw new AppError('DOWNGRADE_NOT_ALLOWED', 'Only a higher plan can be bought while a membership runs')
  }
  return verdict
}
