import { discountedPriceCents } from '../codes'
import type { MembershipTier, SiteProduct } from '../config'

const PAY_PERCENT: Record<MembershipTier, number> = { starter: 95, pro: 90, max: 85 }

// The member rate as a percentage off the list price (5 / 10 / 15), for the paywall perks.
export const packMemberPercentOff = (tier: MembershipTier): number => 100 - PAY_PERCENT[tier]

// The member rate changes the pre-tax charge only. Round once, half up, in integer cents.
export function packPriceCents(product: Pick<SiteProduct, 'id' | 'priceUsd'>, tier: MembershipTier | null): number {
  const listCents = Math.round(product.priceUsd * 100)
  if (!tier || (product.id !== 'pack_m' && product.id !== 'pack_l')) return listCents
  return Math.floor((listCents * PAY_PERCENT[tier] + 50) / 100)
}

// A campaign and a membership each discount the list price. Leave the code unused on a tie.
export function bestPackOffer(product: Pick<SiteProduct, 'id' | 'priceUsd'>, tier: MembershipTier | null, codePercent: number | null) {
  const cents = packPriceCents(product, tier)
  if (!codePercent) return { cents, useCode: false }
  const list = packPriceCents(product, null)
  // Stripe rounds the coupon's discount to cents, then subtracts it from the price.
  const couponCents = discountedPriceCents(list, codePercent)
  return couponCents < cents ? { cents: couponCents, useCode: true } : { cents, useCode: false }
}
