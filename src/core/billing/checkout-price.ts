import type { MembershipTier, SiteConfig, SiteProduct } from '../config'
import { hasMemberRate, packPriceCents } from './pack-price'
export { hasMemberRate }

export type CheckoutPrice = { cents: number; credits: number; memberTier: MembershipTier | null }
export type PricingVersion = SiteConfig['billing']['pricingVersion']

export function configuredPricing(billing: SiteConfig['billing']): PricingVersion {
  return billing.pricingVersion
}

export function quoteCheckout(product: SiteProduct, tier: MembershipTier | null): CheckoutPrice {
  const memberTier = hasMemberRate(product) ? tier : null
  return { cents: packPriceCents(product, memberTier), credits: product.credits, memberTier }
}

export function quoteMetadata(quote?: CheckoutPrice): Record<string, string> {
  return quote ? { pricing_version: 'v2', quoted_credits: String(quote.credits), quoted_usd_cents: String(quote.cents), pack_member_tier: quote.memberTier ?? 'none' } : {}
}
