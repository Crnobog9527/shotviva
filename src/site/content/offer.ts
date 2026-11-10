import { tierOffers, yearlySavingPct } from '@/core/billing/paywall/offer'
import { PRICE_PENDING, usdPerHundredCredits, type MembershipProduct, type SiteProduct, type UsdRange } from '@/core/config'
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

import { site } from '../site.config'

// Every public number on the marketing pages is read here, never typed into copy (建站规格 G3).
// Live pages pass published offers; offline copy uses the phase-one baseline.

// Per-template capabilities and charges come from the live catalogue.
export const OUTPUT_TIERS = [
  { name: 'Standard', px: 1024, use: 'social posts and delivery apps' },
  { name: 'HD', px: 2048, use: 'websites and online stores' },
  { name: 'Max', px: 2880, use: 'print and zoom' },
] as const

export const tierNames = OUTPUT_TIERS.map((tier) => tier.name)

// "Standard, HD or Max"
export const tierList = `${tierNames.slice(0, -1).join(', ')} or ${tierNames.at(-1)}`

// "Standard 1024 px, HD 2048 px, Max 2880 px"
export const tierPixels = OUTPUT_TIERS.map((tier) => `${tier.name} ${tier.px} px`).join(', ')

// "from N credits" / "From N credits": N is the cheapest Standard price among the published web
// templates (建站规格 G4, gap audit A1), known only when the page renders. Copy carries these
// markers; the page fills them from the catalogue (fillCredits in ./credits).
export const fromCredits = '⟦from-credits⟧'
export const FromCredits = '⟦From-credits⟧'

// "One product, three styled photos": the home demo and the two bills (DESIGN §6.9 item 6).
export const SET_PHOTOS = 3

// Cheapest published Standard price and whether it is shared by every template.
export type CreditFacts = { from: number; same: boolean }

// Public signup copy states the credit grant; the selected template determines the number of photos.
export const freeImagesLabel = `${site.billing.freeCredits} free credits`
export const FreeImagesLabel = freeImagesLabel
export const FreeImagesTitle = `${site.billing.freeCredits} Free Credits`
export const FreeImagesShort = freeImagesLabel

export const MENU_DISHES = 10

// "JPG, PNG or WebP, up to 20MB"
const FORMAT_NAMES: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }
const formats = UPLOAD_CONTENT_TYPES.map((type) => FORMAT_NAMES[type] ?? type)
export const uploadLimits = `${formats.slice(0, -1).join(', ')} or ${formats.at(-1)}, up to ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', zh: 'Simplified Chinese' }
export const languages = site.locales.enabled.map((code) => LANGUAGE_NAMES[code] ?? code).join(', ')

export function product(id: string, products: readonly SiteProduct[] = site.billing.products): SiteProduct | undefined {
  return products.find((p) => p.id === id && p.priceUsd > 0)
}

// "$19.90", "$139"
export function usd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount.toLocaleString('en-US')}` : `$${amount.toFixed(2)}`
}

export function priceOf(id: string): string {
  const found = product(id)
  return found ? usd(found.priceUsd) : PRICE_PENDING
}

export function creditsOf(id: string): string {
  const found = product(id)
  return found ? found.credits.toLocaleString('en-US') : PRICE_PENDING
}

export function perHundredCredits(id: string, products: readonly SiteProduct[] = site.billing.products): string {
  const found = product(id, products)
  return found ? formatHundredCredits(usdPerHundredCredits(found)) : PRICE_PENDING
}

const formatHundredCredits = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function offerFacts(products: readonly SiteProduct[]) {
  const priced = products.filter(p => p.priceUsd > 0).sort((a, b) => a.priceUsd - b.priceUsd)
  const units = priced.map(usdPerHundredCredits)
  return {
    products,
    planFrom: priced.find((p): p is MembershipProduct => p.interval === 'month'),
    packFrom: priced.find(p => p.tier === 'pack'),
    hundredCreditsFrom: units.length ? formatHundredCredits(Math.min(...units)) : undefined,
    yearlySaving: yearlySavingPct(tierOffers(products)) ?? undefined,
  }
}

export type OfferFacts = ReturnType<typeof offerFacts>
export const baselineOffers = offerFacts(site.billing.products)
export const { planFrom, packFrom, yearlySaving, hundredCreditsFrom } = baselineOffers

export function planLabel(plan: OfferFacts['planFrom']) {
  if (!plan) return 'Monthly plan'
  const names = { starter: 'Starter', pro: 'Pro', max: 'Max' }
  return `${names[plan.tier]} plan, ${plan.credits} credits a month`
}

// One sentence on paid options, used by the home page, the generator page and FAQ answers.
export function plansSentence({ planFrom, packFrom } = baselineOffers): string {
  if (!planFrom) return packFrom ? `One-time credit packs start at ${usd(packFrom.priceUsd)}.` : 'Paid plans and one-time credit packs are coming soon.'
  const packs = packFrom ? `, or buy a one-time credit pack from ${usd(packFrom.priceUsd)}` : ''
  return `Plans start at ${usd(planFrom.priceUsd)} a month for ${planFrom.credits} credits${packs}.`
}

// --- The home page's two bills (DESIGN §6.9 item 6). The photographer's rates and the seconds
// a photo takes live in site.config.marketing; everything here is arithmetic on them. ---

const { photographer, photoSecondsApprox } = site.marketing

const times = (range: UsdRange, n: number): UsdRange => ({ low: range.low * n, high: range.high * n })

// "$50–$350"
export const usdRange = (range: UsdRange) => `${usd(range.low)}–${usd(range.high)}`

export const styledShotUsd = photographer.styledShotUsd
export const packshotUsd = photographer.packshotUsd
export const dayRateUsd = photographer.dayRateUsd
export const foodHalfDayUsd = photographer.foodHalfDayUsd
// Three styled shots, the whole quote: $150–$1,050 (retouching is in the shot price).
export const setShotsUsd = times(styledShotUsd, SET_PHOTOS)
export const quoteUsd: UsdRange = setShotsUsd

// "60": the one round figure for how long a photo takes (no ranges, no per-quality times).
export const photoSeconds = photoSecondsApprox
