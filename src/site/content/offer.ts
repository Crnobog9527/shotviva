import { PRICE_PENDING, pricedProducts, usdPerHundredCredits, type SiteProduct, type UsdRange } from '@/core/config'
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

import { site } from '../site.config'

// Every public number on the marketing pages is read here, never typed into copy (建站规格 G3).
// Prices and credits come from site.config; nothing below restates them.

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

// --- Plans and packs. Product ids are fixed by ARCHITECTURE §6.2. Until T9 puts the nine
// products into site.config, lookups return nothing and the copy says PRICE_PENDING. ---

export const PLAN_TIERS = [
  { name: 'Starter', monthly: 'starter_monthly', yearly: 'starter_yearly' },
  { name: 'Pro', monthly: 'pro_monthly', yearly: 'pro_yearly' },
  { name: 'Max', monthly: 'max_monthly', yearly: 'max_yearly' },
] as const

export const PACKS = [
  { name: 'Small pack', id: 'pack_s' },
  { name: 'Medium pack', id: 'pack_m' },
  { name: 'Large pack', id: 'pack_l' },
] as const

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

function cheapest(ids: readonly string[], products: readonly SiteProduct[]): SiteProduct | undefined {
  const found = ids.map(id => product(id, products)).filter((p): p is SiteProduct => p !== undefined)
  return found.sort((a, b) => a.priceUsd - b.priceUsd)[0]
}

// Largest yearly saving across the configured plans, rounded to the nearest whole percent.
function yearlySavingPct(products: readonly SiteProduct[]): number | undefined {
  const pcts = PLAN_TIERS.flatMap((tier) => {
    const month = product(tier.monthly, products)
    const year = product(tier.yearly, products)
    if (!month || !year) return []
    // From integer cents, so float error cannot move a .5 boundary.
    const monthlyYear = Math.round(month.priceUsd * 100) * 12
    return [Math.round(((monthlyYear - Math.round(year.priceUsd * 100)) * 100) / monthlyYear)]
  })
  return pcts.length === PLAN_TIERS.length ? Math.max(...pcts) : undefined
}

export function offerFacts(products: readonly SiteProduct[]) {
  return {
    planFrom: cheapest(PLAN_TIERS.map(tier => tier.monthly), products),
    packFrom: cheapest(PACKS.map(pack => pack.id), products),
    yearlySaving: yearlySavingPct(products),
  }
}

export const { planFrom, packFrom, yearlySaving } = offerFacts(site.billing.products)

const unitPrices = pricedProducts(site).map(usdPerHundredCredits)
export const hundredCreditsFrom = unitPrices.length ? formatHundredCredits(Math.min(...unitPrices)) : undefined

// One sentence on paid options, used by the home page, the generator page and FAQ answers.
export function plansSentence(): string {
  if (!planFrom) return 'Paid plans and one-time credit packs are coming soon.'
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
