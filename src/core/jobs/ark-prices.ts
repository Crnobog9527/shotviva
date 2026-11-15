import { z } from 'zod'

// A Volcano Engine Ark line's list price in yuan (ai_providers.list_price, 1566), typed in by the
// admin from Ark's price page with that page's URL and the date read: there is no price table in
// code (Owner 2026-11-15). Ark's own price API (ListModelChargeItems) is signed with an account
// AK/SK, which the site does not hold. Ark bills each successfully generated image by its pixel
// count, plus each input image; images blocked by moderation are not billed. A line without a
// price still generates, but its jobs have no cost and the admin list says so.

export const arkPriceSchema = z.object({
  // The model this price is for: a price typed for another model (a concurrent edit) prices nothing.
  model: z.string().trim().min(1).max(120),
  // Ascending by maxPixels; the first band whose maxPixels holds the output image's pixels applies.
  // null maxPixels: no upper limit (the last band).
  outputBands: z.array(z.object({ maxPixels: z.number().int().positive().nullable(), cny: z.number().nonnegative().finite() })).min(1).max(5),
  inputImageCny: z.number().nonnegative().finite(),
  source: z.string().startsWith('https://').max(500),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type ArkPrice = z.infer<typeof arkPriceSchema>

// The row's list price, only while it is for the row's model.
export function currentListPrice(row: { model: string; listPrice?: ArkPrice | null }): ArkPrice | null {
  return row.listPrice && row.listPrice.model === row.model.trim() ? row.listPrice : null
}

// numeric(10, 6) like cost_usd.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

export type ArkListCost = { list_cost_cny: number; cny_per_usd: number; list_cost_usd: number }

// The yuan list price of one call and its US-dollar equivalent at `cnyPerUsd`. null when the model
// has no price or the image is larger than every band (the request would have been rejected).
export function arkListCost(
  price: ArkPrice | null | undefined, counts: { generatedImages: number; inputImages: number; pixels: number }, cnyPerUsd: number,
): ArkListCost | null {
  if (!price || !(cnyPerUsd > 0)) return null
  const band = price.outputBands.find((entry) => entry.maxPixels === null || counts.pixels <= entry.maxPixels)
  if (counts.generatedImages > 0 && !band) return null
  const cny = counts.generatedImages * (band?.cny ?? 0) + counts.inputImages * price.inputImageCny
  return { list_cost_cny: round6(cny), cny_per_usd: cnyPerUsd, list_cost_usd: round6(cny / cnyPerUsd) }
}
