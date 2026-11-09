import { z } from 'zod'

import { MEMBERSHIP_TIERS, type MembershipTier, type SiteConfig, type SiteProduct } from '../config'
import { AppError } from '../errors'
import { packPriceCents } from './pack-price'

export type CheckoutPrice = { cents: number; credits: number; memberTier: MembershipTier | null }
export type PricingVersion = SiteConfig['billing']['pricingVersion']

export function configuredPricing(billing: SiteConfig['billing']): PricingVersion {
  return billing.pricingVersion
}

export function hasMemberRate(product: SiteProduct): boolean {
  return product.id === 'pack_m' || product.id === 'pack_l'
}

export function quoteCheckout(product: SiteProduct, tier: MembershipTier | null): CheckoutPrice {
  const memberTier = hasMemberRate(product) ? tier : null
  return { cents: packPriceCents(product, memberTier), credits: product.credits, memberTier }
}

export function quoteMetadata(quote?: CheckoutPrice): Record<string, string> {
  return quote ? { pricing_version: 'v2', quoted_credits: String(quote.credits), quoted_usd_cents: String(quote.cents), pack_member_tier: quote.memberTier ?? 'none' } : {}
}

// Only server-written metadata from an authenticated channel object may enter here.
// Missing version is a legacy contract. Unknown or incomplete snapshots must be retried.
const snapshot = z.object({
  pricing_version: z.literal('v2'),
  quoted_credits: z.string().regex(/^[1-9]\d{0,8}$/).transform(Number),
  quoted_usd_cents: z.string().regex(/^[1-9]\d{0,8}$/).transform(Number),
  pack_member_tier: z.union([z.enum(MEMBERSHIP_TIERS), z.literal('none')]),
})

export function readQuote(metadata: Record<string, unknown>, product: SiteProduct): CheckoutPrice | undefined {
  if (metadata.pricing_version == null && metadata.quoted_usd_cents == null && metadata.pack_member_tier == null && metadata.quoted_credits == null) return undefined
  const result = snapshot.safeParse(metadata)
  if (!result.success) throw new AppError('INVALID_INPUT', 'Invalid checkout pricing snapshot')
  const { quoted_usd_cents: cents, quoted_credits: credits, pack_member_tier: tier } = result.data
  if (tier !== 'none' && !hasMemberRate(product)) throw new AppError('INVALID_INPUT', 'Unexpected member rate on checkout')
  return { cents, credits, memberTier: tier === 'none' ? null : tier }
}
