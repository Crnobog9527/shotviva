import { PRICE_PENDING, pricedProducts, type SiteProduct, type UsdRange } from '@/core/config'
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

import { site } from '../site.config'

// Every public number on the marketing pages is read here, never typed into copy (建站规格 G3).
// Prices and credits come from site.config; nothing below restates them.

// The three output tiers as the public sees them (ARCHITECTURE §5, §8.1; DESIGN §4.3). The
// pixel sizes are fixed by modules/image (T16) and the per-template cost lives in
// templates.credits_cost; these are the `high` defaults (what a credit buys). Counts of images
// (the signup gift, the bills) and "from N credits" follow the catalogue instead: see
// fromCredits and CreditFacts below; Standard's 2 only stands in when there is no catalogue.
// Public copy never says 1K / 2K / 3K or 4K.
export const OUTPUT_TIERS = [
  { name: 'Standard', px: 1024, credits: 2, use: 'social posts and delivery apps' },
  { name: 'HD', px: 2048, credits: 4, use: 'websites and online stores' },
  { name: 'Max', px: 2880, credits: 6, use: 'print and zoom' },
] as const

const STANDARD = OUTPUT_TIERS[0]

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

// The signup gift in Standard images at N credits each: 6 free credits at 1 credit = 6.
export const freeStandardImages = (n: number) => Math.floor(site.billing.freeCredits / n)

// "up to 6 free Standard images" / "Up to 6 free Standard images" / "Up to 6 Free Standard
// Images" / "Up to 6 free images" (the home meta description, 155 characters): the only place
// the site counts in images instead of credits. "up to" goes when every template costs the same.
export const freeImagesLabel = '⟦free-images⟧'
export const FreeImagesLabel = '⟦Free-images⟧'
export const FreeImagesTitle = '⟦Free-Images⟧'
export const FreeImagesShort = '⟦Free-images-short⟧'

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
  // Half-cents round up ($9.90 / 20 = $0.495 shows $0.50); the epsilon undoes float error.
  return `$${(Math.round((found.priceUsd / found.credits) * 100 + 1e-9) / 100).toFixed(2)}`
}

function cheapest(ids: readonly string[]): SiteProduct | undefined {
  const found = ids.map(product).filter((p): p is SiteProduct => p !== undefined)
  return found.sort((a, b) => a.priceUsd - b.priceUsd)[0]
}

// Cheapest monthly plan and cheapest pack, e.g. "$19.90" / "$9.90"; undefined until priced.
export const planFrom = cheapest(PLAN_TIERS.map((tier) => tier.monthly))
export const packFrom = cheapest(PACKS.map((pack) => pack.id))

// Largest yearly saving across the tiers, rounded to the nearest whole percent: "up to 40%"
// (DESIGN §6.9; Max saves 39.98%).
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

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

type FreeStyle = 'plain' | 'title' | 'short'

function freeImages({ from, same }: CreditFacts, style: FreeStyle = 'plain'): string {
  const count = freeStandardImages(from)
  const image = count === 1 ? 'image' : 'images'
  const nouns: Record<FreeStyle, string> = {
    plain: `free ${STANDARD.name} ${image}`,
    title: `Free ${STANDARD.name} ${sentence(image)}`,
    short: `free ${image}`,
  }
  return same ? `${count} ${nouns[style]}` : `${style === 'title' ? 'Up' : 'up'} to ${count} ${nouns[style]}`
}

// N credits at the cheapest plan's credit price, rounded the way /pricing shows it: 3 × $0.40 =
// "$1.20". Empty until the plans are priced.
function creditsUsd(credits: number): string {
  if (!planFrom) return ''
  const credit = Math.round((planFrom.priceUsd / planFrom.credits) * 100 + 1e-9) / 100
  return usd(Math.round(credit * credits * 100) / 100)
}

// Standard photos the rest of the cheapest plan's month still makes: (50 − 3) ÷ 1 = 47.
const photosLeft = (spent: number, n: number) => (planFrom ? String(Math.floor((planFrom.credits - spent) / n)) : '')

export const COUNT_MARKERS: readonly (readonly [string, (facts: CreditFacts) => string])[] = [
  [freeImagesLabel, (facts) => freeImages(facts)],
  [FreeImagesLabel, (facts) => sentence(freeImages(facts))],
  [FreeImagesTitle, (facts) => freeImages(facts, 'title')],
  [FreeImagesShort, (facts) => sentence(freeImages(facts, 'short'))],
  [setCredits, ({ from }) => String(from * SET_PHOTOS)],
  [setCostUsd, ({ from }) => creditsUsd(from * SET_PHOTOS)],
  [photosLeftInPlan, ({ from }) => photosLeft(from * SET_PHOTOS, from)],
  [menuCredits, ({ from }) => String(from * MENU_DISHES)],
  [menuCostUsd, ({ from }) => creditsUsd(from * MENU_DISHES)],
  [photosLeftAfterMenu, ({ from }) => photosLeft(from * MENU_DISHES, from)],
]
