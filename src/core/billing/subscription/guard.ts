import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProductId, SiteProduct } from '../../config'
import { AppError } from '../../errors'
import type { RpcClient } from '../rpc'
import { historicalProducts } from '../product-catalog'
import { currentTier } from '../tier'
import { readMirrorRows } from './read-summary'
import { isLiveStatus, type MirrorRow } from './summary'
import { entitlementRank, membershipRank, purchaseVerdict, type MemberStanding, type PurchaseVerdict } from './upgrade-rule'

// The checkout guard (ARCHITECTURE §6.2 「升级」, T66; before it, any membership while a
// subscription ran was refused, found in Codex's #165 validation). A higher plan is an upgrade;
// the same plan or a lower one while a membership runs is 409 DOWNGRADE_NOT_ALLOWED, on every
// route (Managed Payments card, 中国银行卡, Alipay, Waffo). Packs are always allowed.

// The highest-ranked subscription Stripe or Waffo may still bill or whose paid period still runs.
function productRank(id: ProductId, products: readonly SiteProduct[]): number {
  const product = products.find(p => p.id === id)
  return product && product.tier !== 'pack' ? entitlementRank(product.tier, product.interval) : membershipRank(id)
}

export function heldSubscription(rows: readonly MirrorRow[], products: readonly SiteProduct[] = []): ProductId | null {
  let held: ProductId | null = null
  let highest = -1
  for (const row of rows) {
    if (!isLiveStatus(row.status)) continue
    const id = row.productId as ProductId
    const rank = productRank(id, products)
    if (rank < 0) throw new AppError('INTERNAL', 'Unknown subscription identity')
    if (rank > highest) { highest = rank; held = id }
  }
  return held
}

export async function readStanding(admin: SupabaseClient & RpcClient, userId: string): Promise<MemberStanding> {
  const [rows, tier] = await Promise.all([readMirrorRows(admin, userId), currentTier(admin, userId)])
  const needsIdentity = rows.some(row => isLiveStatus(row.status) && membershipRank(row.productId as ProductId) < 0)
  const identities = needsIdentity ? await historicalProducts(admin, 'v2') : []
  const subscription = heldSubscription(rows, identities)
  return { subscription, tier, subscriptionRank: subscription ? productRank(subscription, identities) : undefined }
}

export async function assertCanBuy(admin: SupabaseClient & RpcClient, userId: string, product: SiteProduct): Promise<PurchaseVerdict> {
  if (product.tier === 'pack') return 'buy'
  const verdict = purchaseVerdict(await readStanding(admin, userId), product.id, entitlementRank(product.tier, product.interval))
  if (verdict === 'blocked') {
    throw new AppError('DOWNGRADE_NOT_ALLOWED', 'Only a higher plan can be bought while a membership runs')
  }
  return verdict
}
