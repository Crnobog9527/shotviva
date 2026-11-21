import { discountedPriceCents } from '../codes/discount'
import type { MembershipTier, SiteProduct } from '../config'

type PackTerms = Pick<SiteProduct, 'id' | 'priceUsd' | 'packMemberPayPct'>

// What a member pays for an M / L pack, in percent of the list price. Each catalogue revision
// stores its own rate (migration 1610): revisions saved before it, and the site.config seed that
// mirrors revision 2, pay 95 / 90 / 85; later revisions carry theirs (2026-11-21: 100 / 95 / 90).
export const REVISION_2_PACK_MEMBER_PAY: Readonly<Record<MembershipTier, number>> = { starter: 95, pro: 90, max: 85 }

const payPct = (product: Pick<SiteProduct, 'packMemberPayPct'>, tier: MembershipTier) =>
  (product.packMemberPayPct ?? REVISION_2_PACK_MEMBER_PAY)[tier]

export const hasMemberRate = (product: Pick<SiteProduct, 'id'>): boolean => product.id === 'pack_m' || product.id === 'pack_l'

// The member rate as a percentage off the list price (2026-11-21: 0 / 5 / 10), for the paywall perks.
export const packMemberPercentOff = (product: Pick<SiteProduct, 'packMemberPayPct'>, tier: MembershipTier): number =>
  100 - payPct(product, tier)

// The member rate changes the pre-tax charge only. Round once, half up, in integer cents.
export function packPriceCents(product: PackTerms, tier: MembershipTier | null): number {
  const listCents = Math.round(product.priceUsd * 100)
  if (!tier || !hasMemberRate(product)) return listCents
  return Math.floor((listCents * payPct(product, tier) + 50) / 100)
}

// A campaign and a membership each discount the list price. Leave the code unused on a tie.
export function bestPackOffer(product: PackTerms, tier: MembershipTier | null, codePercent: number | null) {
  const cents = packPriceCents(product, tier)
  if (!codePercent) return { cents, useCode: false }
  const list = packPriceCents(product, null)
  // Stripe rounds the coupon's discount to cents, then subtracts it from the price.
  const couponCents = discountedPriceCents(list, codePercent)
  return couponCents < cents ? { cents: couponCents, useCode: true } : { cents, useCode: false }
}
