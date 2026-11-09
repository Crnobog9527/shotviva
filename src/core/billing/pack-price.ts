import type { MembershipTier, SiteProduct } from '../config'

const PAY_PERCENT: Record<MembershipTier, number> = { starter: 95, pro: 90, max: 85 }

// The member rate changes the pre-tax charge only. Round once, half up, in integer cents.
export function packPriceCents(product: Pick<SiteProduct, 'id' | 'priceUsd'>, tier: MembershipTier | null): number {
  const listCents = Math.round(product.priceUsd * 100)
  if (!tier || (product.id !== 'pack_m' && product.id !== 'pack_l')) return listCents
  return Math.floor((listCents * PAY_PERCENT[tier] + 50) / 100)
}
