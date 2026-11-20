import type { MembershipProduct, MembershipTier, PackProduct, ProductInterval, SiteProduct } from '../../config'

// The numbers the paywall and /pricing show, all derived from published products
// (ARCHITECTURE §6.2, 建站规格 G3): nothing here is typed by hand. Amounts are computed in
// cents so $19.90 × 12 − $191 is exactly $47.80.

export type Period = ProductInterval

export type TierOffer = { tier: MembershipTier; monthly?: MembershipProduct; yearly?: MembershipProduct }

const cents = (usd: number) => Math.round(usd * 100)

// An annual comparison is meaningful only within the same SKU family. The
// catalog sort order determines which listed family a generic tier entry opens.
export function tierOffers(products: readonly SiteProduct[], period?: Period): TierOffer[] {
  const families = new Map<string, TierOffer>()
  for (const product of products) {
    if (product.tier === 'pack' || product.priceUsd <= 0) continue
    const family = product.tier + ':' + product.id.replace(/_(monthly|yearly)$/, '')
    const offer = families.get(family) ?? { tier: product.tier }
    if (product.interval === 'month') offer.monthly = product
    else offer.yearly = product
    families.set(family, offer)
  }
  return [...families.values()].filter(offer => !period || (period === 'month' ? offer.monthly : offer.yearly))
}

export function offerLabel(product: MembershipProduct, locale: string, tierLabel: string): string {
  return product.revision && product.revision > 2 ? product.names?.[locale === 'zh' ? 'zh' : 'en'] ?? tierLabel : tierLabel
}

export function packOffers(products: readonly SiteProduct[]): PackProduct[] {
  return products.filter((p): p is PackProduct => p.tier === 'pack' && p.priceUsd > 0)
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
  const product = period === 'year' ? offer.yearly : offer.monthly
  if (!product) throw new Error('Unavailable membership period')
  return product
}

// Monthly price, or the yearly price spread over twelve months ($191 → $15.92).
export function perMonthUsd(offer: TierOffer, period: Period): number {
  const price = productFor(offer, period).priceUsd
  return period === 'year' ? Math.round(cents(price) / 12) / 100 : price
}

// Keep fractional cents until formatting the per-credit price.
export function perCreditUsd(product: SiteProduct): number {
  return product.priceUsd / product.credits
}

// What a year costs on monthly minus the yearly price: $47.80 / $119.80 / $475.
export function yearlySavingUsd(offer: TierOffer): number {
  if (!offer.monthly || !offer.yearly) return 0
  return (cents(offer.monthly.priceUsd) * 12 - cents(offer.yearly.priceUsd)) / 100
}

// What Yearly saves against twelve monthly payments on one plan, as a whole percent rounded
// down so the claim holds (ratios from integer cents: float error cannot move a boundary).
export function planSavingPct(offer: TierOffer): number {
  if (!offer.monthly || !offer.yearly) return 0
  const monthYear = cents(offer.monthly.priceUsd) * 12
  return Math.max(0, Math.floor(((monthYear - cents(offer.yearly.priceUsd)) * 100) / monthYear))
}

// Over the listed plans (ARCHITECTURE §6.2): pct is the smallest saving, upTo the largest, and
// byTier each plan's own (Owner 2026-11-21: 20% / 20% / 25%, said per plan, "Max saves 25%").
export type YearlySaving = { pct: number; upTo: number; byTier: readonly { tier: MembershipTier; pct: number }[] }

export function yearlySaving(offers: readonly TierOffer[]): YearlySaving | null {
  const byTier = offers.filter(o => o.monthly && o.yearly).map(o => ({ tier: o.tier, pct: planSavingPct(o) }))
  const values = byTier.map(t => t.pct)
  if (values.length === 0 || Math.max(...values) <= 0) return null
  return { pct: Math.min(...values), upTo: Math.max(...values), byTier }
}

// Whole dollars without decimals ("$191"), the rest with two ("$19.90"). The plain "$" in every
// language: Chinese would otherwise print "US$19.90" next to the "$19.90" of the page copy, and
// a price has one written form across the site (建站规格 G3, ARCHITECTURE §17).
export function usdFormat(amount: number, showCents = false) {
  const whole = !showCents && Number.isInteger(amount)
  return {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  } as const
}

export function monthlyAllowance(offer: TierOffer, period?: Period) {
  if (period === 'year' && offer.yearly) return offer.yearly.credits / 12
  return offer.monthly?.credits ?? (offer.yearly?.credits ?? 0) / 12
}
