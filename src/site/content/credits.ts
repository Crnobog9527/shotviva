import type { CreditBuysBlock } from '@/core/content'

import { COUNT_MARKERS, OUTPUT_TIERS, FromCredits, fromCredits, type CreditFacts } from './offer'
import { ZH_COUNT_MARKERS, zhFromCredits } from './zh/offer'

// "from N credits" and every count of images on the marketing pages (建站规格 G3, G4, gap audit
// A1, T91): N is the lowest Standard (1K) price among the published web templates, read from
// the cached catalogue the page already renders from. With no catalogue (a build without a
// database, an outage) the standard template's Standard price stands in, the same for all.
export const FALLBACK_CREDITS: CreditFacts = { from: OUTPUT_TIERS[0].credits, same: true }

type Priced = { creditsCost: { '1k': number; '2k': number; '3k': number } }

const priceList = (live: readonly Priced[], tier: keyof Priced['creditsCost']) =>
  live.map((template) => template.creditsCost[tier]).filter((n) => Number.isFinite(n) && n > 0)

export function creditFacts(live: readonly Priced[]): CreditFacts {
  const prices = priceList(live, '1k')
  if (prices.length === 0) return FALLBACK_CREDITS
  const from = Math.min(...prices)
  return { from, same: prices.every((n) => n === from) }
}

// The most common price, the cheaper one on a tie; undefined for an empty list.
function mostCommon(prices: readonly number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const n of prices) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts].sort(([a, x], [b, y]) => y - x || a - b)[0]?.[0]
}

// /pricing's "What a credit buys" says what a photo costs "on most templates" at Standard, HD
// and Max: the most common price at each among the published web templates (T91), so it never
// contradicts the catalogue. With no catalogue the page's own numbers stand.
export function withCatalogueTiers(block: CreditBuysBlock, live: readonly Priced[]): CreditBuysBlock {
  const tiers = (['1k', '2k', '3k'] as const).map((tier) => mostCommon(priceList(live, tier)))
  return { ...block, tiers: block.tiers.map((tier, i) => ({ ...tier, credits: tiers[i] ?? tier.credits })) }
}

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`
const MARKERS: readonly (readonly [string, (facts: CreditFacts) => string])[] = [
  [fromCredits, ({ from }) => `from ${credits(from)}`],
  [FromCredits, ({ from }) => `From ${credits(from)}`],
  [zhFromCredits, ({ from }) => `${from} 积分起`],
  ...COUNT_MARKERS,
  ...ZH_COUNT_MARKERS,
]

export const hasCreditMarkers = (text: string) => MARKERS.some(([marker]) => text.includes(marker))

function fillText(text: string, facts: CreditFacts): string {
  return MARKERS.reduce((out, [marker, render]) => out.replaceAll(marker, render(facts)), text)
}

const isPlain = (value: object) => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// The page's copy with every marker filled; arrays and plain objects are copied, anything else
// (images, functions) is kept as is.
export function fillCredits<T>(value: T, facts: CreditFacts): T {
  if (typeof value === 'string') return fillText(value, facts) as T
  if (Array.isArray(value)) return value.map((item) => fillCredits(item, facts)) as T
  if (value && typeof value === 'object' && isPlain(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, fillCredits(inner, facts)])) as T
  }
  return value
}
