import type { MembershipProduct, MembershipTier, PackProduct, ProductInterval, SiteProduct } from '../../config'

// The numbers the paywall and /pricing show, all derived from site.config's nine products
// (ARCHITECTURE §6.2, 建站规格 G3): nothing here is typed by hand. Amounts are computed in
// cents so $19.90 × 12 − $139 is exactly $99.80.

export type Period = ProductInterval

export type TierOffer = { tier: MembershipTier; monthly: MembershipProduct; yearly: MembershipProduct }

const TIER_ORDER: readonly MembershipTier[] = ['starter', 'pro', 'max']

const cents = (usd: number) => Math.round(usd * 100)

export function tierOffers(products: readonly SiteProduct[]): TierOffer[] {
  const memberships = products.filter((p): p is MembershipProduct => p.tier !== 'pack' && p.priceUsd > 0)
  return TIER_ORDER.flatMap((tier) => {
    const monthly = memberships.find((p) => p.tier === tier && p.interval === 'month')
    const yearly = memberships.find((p) => p.tier === tier && p.interval === 'year')
    return monthly && yearly ? [{ tier, monthly, yearly }] : []
  })
}

export function packOffers(products: readonly SiteProduct[]): PackProduct[] {
  return products
    .filter((p): p is PackProduct => p.tier === 'pack' && p.priceUsd > 0)
    .sort((a, b) => a.priceUsd - b.priceUsd)
}

export function productFor(offer: TierOffer, period: Period): MembershipProduct {
  return period === 'year' ? offer.yearly : offer.monthly
}

// Monthly price, or the yearly price spread over twelve months ($139 → $11.58).
export function perMonthUsd(offer: TierOffer, period: Period): number {
  return period === 'year' ? Math.round(cents(offer.yearly.priceUsd) / 12) / 100 : offer.monthly.priceUsd
}

// Half-cents round up ($9.90 / 20 = $0.495 → $0.50), as the marketing copy does.
export function perCreditUsd(product: SiteProduct): number {
  return Math.round(cents(product.priceUsd) / product.credits + 1e-9) / 100
}

// What a year costs on monthly minus the yearly price: $99.80 / $249.80 / $489.
export function yearlySavingUsd(offer: TierOffer): number {
  return (cents(offer.monthly.priceUsd) * 12 - cents(offer.yearly.priceUsd)) / 100
}

// The smallest saving across the tiers, rounded down, for "Save 41%" on the Yearly segment.
export function yearlySavingPct(offers: readonly TierOffer[]): number | null {
  if (offers.length === 0) return null
  const pcts = offers.map((o) => 1 - cents(o.yearly.priceUsd) / (cents(o.monthly.priceUsd) * 12))
  return Math.floor(Math.min(...pcts) * 100)
}

// Whole dollars without decimals ("$139"), the rest with two ("$19.90").
export function usdFormat(amount: number) {
  const whole = Number.isInteger(amount)
  return { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 } as const
}
