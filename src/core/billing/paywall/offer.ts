import type { MembershipProduct, MembershipTier, PackProduct, ProductInterval, SiteProduct } from '../../config'

// The numbers the paywall and /pricing show, all derived from site.config's nine products
// (ARCHITECTURE §6.2, 建站规格 G3): nothing here is typed by hand. Amounts are computed in
// cents so $19.90 × 12 − $191 is exactly $47.80.

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

export type PackTone = 'graphite' | 'sapphire' | 'gold'
export type PackLook = { tone: PackTone; flag: 'bestValue' | null }

// Highlight the largest pack only when its list price per credit is strictly lower.
export function packLooks(packs: readonly PackProduct[]): PackLook[] {
  if (packs.length !== 3) return packs.map(() => ({ tone: 'graphite', flag: null }))
  const cheapest = Math.min(...packs.slice(0, -1).map(perCreditUsd))
  const largest = packs[2]
  return [
    { tone: 'graphite', flag: null },
    { tone: 'sapphire', flag: null },
    { tone: 'gold', flag: largest && perCreditUsd(largest) < cheapest ? 'bestValue' : null },
  ]
}

export function productFor(offer: TierOffer, period: Period): MembershipProduct {
  return period === 'year' ? offer.yearly : offer.monthly
}

// Monthly price, or the yearly price spread over twelve months ($191 → $15.92).
export function perMonthUsd(offer: TierOffer, period: Period): number {
  return period === 'year' ? Math.round(cents(offer.yearly.priceUsd) / 12) / 100 : offer.monthly.priceUsd
}

// Keep fractional cents until formatting the per-credit price.
export function perCreditUsd(product: SiteProduct): number {
  return product.priceUsd / product.credits
}

// What a year costs on monthly minus the yearly price: $47.80 / $119.80 / $475.
export function yearlySavingUsd(offer: TierOffer): number {
  return (cents(offer.monthly.priceUsd) * 12 - cents(offer.yearly.priceUsd)) / 100
}

// Largest annual saving across the current catalogue, rounded to a whole percent.
export function yearlySavingPct(offers: readonly TierOffer[]): number | null {
  if (offers.length === 0) return null
  return Math.max(...offers.map(savingPct))
}

function savingPct(offer: TierOffer): number {
  const monthlyYear = cents(offer.monthly.priceUsd) * 12
  // Whole percent, from integer cents so float error cannot move a .5 boundary.
  return Math.round(((monthlyYear - cents(offer.yearly.priceUsd)) * 100) / monthlyYear)
}

// Whole dollars without decimals ("$191"), the rest with two ("$19.90"). The plain "$" in every
// language: Chinese would otherwise print "US$19.90" next to the "$19.90" of the page copy, and
// a price has one written form across the site (建站规格 G3, ARCHITECTURE §17).
export function usdFormat(amount: number, perCredit = false) {
  const whole = Number.isInteger(amount)
  return {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: perCredit ? 5 : whole ? 0 : 2,
  } as const
}
