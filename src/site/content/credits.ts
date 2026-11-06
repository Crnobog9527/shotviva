import { OUTPUT_TIERS, FromCredits, fromCredits } from './offer'
import { zhFromCredits } from './zh/offer'

// "from N credits" on every marketing page (建站规格 G4, gap audit A1): N is the lowest Standard
// (1K) price among the published web templates, read from the cached catalogue the page already
// renders from. With no catalogue (a build without a database, an outage) the standard
// template's Standard price stands in.
export const FALLBACK_FROM_CREDITS = OUTPUT_TIERS[0].credits

type Priced = { creditsCost: { '1k': number } }

export function startingCredits(live: readonly Priced[]): number {
  const prices = live.map((template) => template.creditsCost['1k']).filter((n) => Number.isFinite(n) && n > 0)
  return prices.length > 0 ? Math.min(...prices) : FALLBACK_FROM_CREDITS
}

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`
const MARKERS: readonly (readonly [string, (n: number) => string])[] = [
  [fromCredits, (n) => `from ${credits(n)}`],
  [FromCredits, (n) => `From ${credits(n)}`],
  [zhFromCredits, (n) => `${n} 积分起`],
]

export const hasCreditMarkers = (text: string) => MARKERS.some(([marker]) => text.includes(marker))

function fillText(text: string, n: number): string {
  return MARKERS.reduce((out, [marker, render]) => out.replaceAll(marker, render(n)), text)
}

const isPlain = (value: object) => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// The page's copy with every marker filled; arrays and plain objects are copied, anything else
// (images, functions) is kept as is.
export function fillCredits<T>(value: T, n: number): T {
  if (typeof value === 'string') return fillText(value, n) as T
  if (Array.isArray(value)) return value.map((item) => fillCredits(item, n)) as T
  if (value && typeof value === 'object' && isPlain(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, fillCredits(inner, n)])) as T
  }
  return value
}
