// Volcano Engine Ark list prices, in yuan, by model id (ARCHITECTURE §10.0: prices live in code
// with their source and date, never typed in by the Owner). Ark bills each successfully generated
// image by its pixel count, plus each input image; images blocked by moderation are not billed.
// Update an entry and its asOf when Volcano Engine changes a price. A model missing here still
// generates, but its jobs have no cost and the admin list says so.

export type ArkPrice = {
  // Ascending; the first band whose maxPixels holds the output image's pixels applies.
  outputBands: readonly { maxPixels: number; cny: number }[]
  inputImageCny: number
  asOf: string
  source: string
}

const ARK_PRICING = 'https://docs.volcengine.com/docs/82379/1544106'

export const ARK_PRICES: Readonly<Record<string, ArkPrice>> = {
  'doubao-seedream-5-5-261028': {
    // "P ≤ 2.61M：0.13；2.61M < P ≤ 4.63M：0.23"; input images 0.05 元/张.
    outputBands: [{ maxPixels: 2_610_000, cny: 0.13 }, { maxPixels: 4_630_000, cny: 0.23 }],
    inputImageCny: 0.05,
    asOf: '2026-11-13',
    source: ARK_PRICING,
  },
  'doubao-seedream-5-0-flash-260915': {
    // "doubao-seedream-5-0-flash：输入图 免费；输出图 0.12" (one price for every size).
    outputBands: [{ maxPixels: Number.POSITIVE_INFINITY, cny: 0.12 }],
    inputImageCny: 0,
    asOf: '2026-11-14',
    source: ARK_PRICING,
  },
}

export function arkPrice(model: string): ArkPrice | null {
  const key = model.trim().toLowerCase()
  return Object.hasOwn(ARK_PRICES, key) ? ARK_PRICES[key]! : null
}

// numeric(10, 6) like cost_usd.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

export type ArkListCost = { list_cost_cny: number; cny_per_usd: number; list_cost_usd: number }

// The yuan list price of one call and its US-dollar equivalent at `cnyPerUsd`. null when the model
// has no price or the image is larger than every band (the request would have been rejected).
export function arkListCost(
  price: ArkPrice | null, counts: { generatedImages: number; inputImages: number; pixels: number }, cnyPerUsd: number,
): ArkListCost | null {
  if (!price || !(cnyPerUsd > 0)) return null
  const band = price.outputBands.find((entry) => counts.pixels <= entry.maxPixels)
  if (counts.generatedImages > 0 && !band) return null
  const cny = counts.generatedImages * (band?.cny ?? 0) + counts.inputImages * price.inputImageCny
  return { list_cost_cny: round6(cny), cny_per_usd: cnyPerUsd, list_cost_usd: round6(cny / cnyPerUsd) }
}
