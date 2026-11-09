import type { CreditBuysBlock } from '@/core/content'

import { COUNT_MARKERS, FromCredits, fromCredits, type CreditFacts } from './offer'
import { zhFromCredits } from './zh/offer'

// With no published price the copy refers to the template instead of quoting a number.
export const FALLBACK_CREDITS: CreditFacts = { from: 0, same: false }

type Priced = { imageOptions?: { resolutions: readonly string[] }; creditsCost: { '1k': number; '2k': number; '3k': number } }

const priceList = (live: readonly Priced[], tier: keyof Priced['creditsCost']) =>
  live.filter((template) => !template.imageOptions || template.imageOptions.resolutions.includes(tier)).map((template) => template.creditsCost[tier]).filter((n) => Number.isFinite(n) && n > 0)

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
// contradicts the catalogue. Unsupported tiers are omitted.
export function withCatalogueTiers(block: CreditBuysBlock, live: readonly Priced[]): CreditBuysBlock {
  const tiers = (['1k', '2k', '3k'] as const).map((tier) => mostCommon(priceList(live, tier)))
  return { ...block, tiers: block.tiers.flatMap((tier, i) => tiers[i] === undefined ? [] : [{ ...tier, credits: tiers[i] }]) }
}

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`
const MARKERS: readonly (readonly [string, (facts: CreditFacts) => string])[] = [
  [fromCredits, ({ from }) => from ? `from ${credits(from)}` : 'credits as shown on the template'],
  [FromCredits, ({ from }) => from ? `From ${credits(from)}` : 'Credits as shown on the template'],
  [zhFromCredits, ({ from }) => from ? `${from} 积分起` : '按模板所示积分计价'],
  ...COUNT_MARKERS,
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
