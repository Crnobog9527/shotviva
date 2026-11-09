import { PRICE_PENDING, pricedProducts, type SiteProduct, type UsdRange } from '@/core/config'
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

// --- Counts that follow the catalogue (建站规格 G3, T91). Every number that counts images made
// from credits uses the same N as "from N credits": the cheapest Standard price among the
// published web templates, known only when the page renders. Copy carries the markers below;
// fillCredits (./credits) renders them with COUNT_MARKERS. ---

// What the page knows about the catalogue: the cheapest Standard price, and whether every
// published template costs that ("6 free Standard images" instead of "up to 6 ...").
export type CreditFacts = { from: number; same: boolean }

// Public signup copy states the credit grant; the selected template determines the number of photos.
export const freeImagesLabel = `${site.billing.freeCredits} free credits`
export const FreeImagesLabel = freeImagesLabel
export const FreeImagesTitle = `${site.billing.freeCredits} Free Credits`
export const FreeImagesShort = freeImagesLabel

// The home set at Standard: "3" credits, "$1.20", and the "47" photos the cheapest plan's month
// still makes after it.
export const setCredits = '⟦set-credits⟧'
export const setCostUsd = '⟦set-usd⟧'
export const photosLeftInPlan = '⟦plan-left⟧'

// /ai-restaurant-menu's bill: a menu of ten dishes at Standard, "10" credits, "$4", "40" left.
export const MENU_DISHES = 10
export const menuCredits = '⟦menu-credits⟧'
export const menuCostUsd = '⟦menu-usd⟧'
export const photosLeftAfterMenu = '⟦menu-left⟧'

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

export function product(id: string): SiteProduct | undefined {
  return pricedProducts(site).find((p) => p.id === id)
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

// "$0.40"
export function perCredit(id: string): string {
  const found = product(id)
  if (!found) return PRICE_PENDING
  // Sub-cent unit prices remain distinct across the plans.
  return `$${(found.priceUsd / found.credits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`
}

function cheapest(ids: readonly string[]): SiteProduct | undefined {
  const found = ids.map(product).filter((p): p is SiteProduct => p !== undefined)
  return found.sort((a, b) => a.priceUsd - b.priceUsd)[0]
}

// Cheapest monthly plan and cheapest pack, e.g. "$19.90" / "$9.90"; undefined until priced.
export const planFrom = cheapest(PLAN_TIERS.map((tier) => tier.monthly))
export const packFrom = cheapest(PACKS.map((pack) => pack.id))

// Largest yearly saving across the configured plans, rounded to the nearest whole percent.
function yearlySavingPct(): number | undefined {
  const pcts = PLAN_TIERS.flatMap((tier) => {
    const month = product(tier.monthly)
    const year = product(tier.yearly)
    if (!month || !year) return []
    // From integer cents, so float error cannot move a .5 boundary.
    const monthlyYear = Math.round(month.priceUsd * 100) * 12
    return [Math.round(((monthlyYear - Math.round(year.priceUsd * 100)) * 100) / monthlyYear)]
  })
  return pcts.length === PLAN_TIERS.length ? Math.max(...pcts) : undefined
}

export const yearlySaving = yearlySavingPct()

// The lowest price of one credit across every plan and pack, e.g. "$0.21" (Max yearly), for
// the home FAQ (建站规格 G6 B). From the same rounding as perCredit.
function lowestCreditPrice(): string | undefined {
  const ids = [...PLAN_TIERS.flatMap((tier) => [tier.monthly, tier.yearly]), ...PACKS.map((pack) => pack.id)]
  const prices = ids.filter((id) => product(id)).map((id) => perCredit(id))
  return prices.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[0]
}

export const creditFrom = lowestCreditPrice()

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

// --- The catalogue counts, rendered (the markers above). ---

// N credits at the cheapest plan's credit price, rounded the way /pricing shows it: 3 × $0.40 =
// "$1.20". Empty until the plans are priced.
function creditsUsd(credits: number): string {
  if (!planFrom) return ''
  return usd(Math.round((planFrom.priceUsd * 100 * credits) / planFrom.credits) / 100)
}

// Standard photos the rest of the cheapest plan's month still makes: (50 − 3) ÷ 1 = 47.
const photosLeft = (spent: number, n: number) => (planFrom ? String(Math.floor((planFrom.credits - spent) / n)) : '')

// The examples use two Standard product shots and one ordinary poster, or ten Standard
// menu photos. Other templates (especially art styles) cannot stand in for these amounts.
const { product: productCredits, poster: posterCredits, menu: menuPhotoCredits } = site.marketing.examplePhotoCredits
const exampleRates = (from: number) => site.billing.pricingVersion
  ? { product: productCredits, poster: posterCredits, menu: menuPhotoCredits }
  : { product: from || 2, poster: from || 2, menu: from || 2 }

const setTotal = (from: number) => {
  const rates = exampleRates(from)
  return 2 * rates.product + rates.poster
}
const menuTotal = (from: number) => MENU_DISHES * exampleRates(from).menu

export const COUNT_MARKERS: readonly (readonly [string, (facts: CreditFacts) => string])[] = [
  [setCredits, ({ from }) => String(setTotal(from))],
  [setCostUsd, ({ from }) => creditsUsd(setTotal(from))],
  [photosLeftInPlan, ({ from }) => photosLeft(setTotal(from), exampleRates(from).product)],
  [menuCredits, ({ from }) => String(menuTotal(from))],
  [menuCostUsd, ({ from }) => creditsUsd(menuTotal(from))],
  [photosLeftAfterMenu, ({ from }) => photosLeft(menuTotal(from), exampleRates(from).menu)],
]
