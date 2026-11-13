// "About N–M photos a month" on the plans (paywall and /pricing): a plan's monthly credits over
// the live Standard prices of the published web templates, so the range moves with the catalogue
// and is never typed. No server-only import: the tier cards render it in the browser.

type Resolution = '1k' | '2k' | '4k'
export type PricedTemplate = { imageOptions?: { resolutions: readonly string[] }; creditsCost: Record<Resolution, number> }

// Credits per photo at Standard: the cheapest, and the price most templates charge.
export type PhotoPrices = { cheapest: number; common: number }
export type PhotoRange = { low: number; high: number }

// What each offered template charges at one resolution; a template that does not offer it,
// or a missing or zero price, is left out.
export function tierCreditPrices(live: readonly PricedTemplate[], tier: Resolution): number[] {
  return live
    .filter((template) => !template.imageOptions || template.imageOptions.resolutions.includes(tier))
    .map((template) => template.creditsCost[tier])
    .filter((n) => Number.isFinite(n) && n > 0)
}

// The most frequent price; on a tie the dearer one, so the low end of the range stays honest.
function mostCommon(prices: readonly number[]): number {
  const counts = new Map<number, number>()
  for (const price of prices) counts.set(price, (counts.get(price) ?? 0) + 1)
  let best = prices[0] as number
  for (const [price, count] of counts) {
    const bestCount = counts.get(best) ?? 0
    if (count > bestCount || (count === bestCount && price > best)) best = price
  }
  return best
}

// null with no priced template: the plans then show no estimate rather than a made-up one.
export function photoPrices(live: readonly PricedTemplate[]): PhotoPrices | null {
  const prices = tierCreditPrices(live, '1k')
  if (prices.length === 0) return null
  return { cheapest: Math.min(...prices), common: mostCommon(prices) }
}

// Whole photos only (rounded down): the common price gives the low end, the cheapest the high.
export function photoRange(creditsPerMonth: number, prices: PhotoPrices | null): PhotoRange | null {
  if (!prices || !(creditsPerMonth > 0)) return null
  const low = Math.floor(creditsPerMonth / prices.common)
  const high = Math.floor(creditsPerMonth / prices.cheapest)
  return high > 0 ? { low: Math.max(low, 0), high } : null
}
