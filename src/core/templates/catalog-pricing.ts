import { z } from 'zod'

// Preserve the provider's billing dimension and unit; a missing rate is unknown.
export const catalogRateSchema = z.strictObject({
  billable: z.string().min(1).max(100),
  unit: z.string().min(1).max(100),
  cost_usd: z.number().nonnegative().finite(),
  variant: z.string().min(1).max(100).optional(),
})
export type CatalogRate = z.infer<typeof catalogRateSchema>

export const catalogPricingSchema = z.object({
  status: z.enum(['quoted', 'unpriced', 'unavailable']),
  endpoints: z.array(z.object({ name: z.string(), rates: z.array(catalogRateSchema) })),
})
export type CatalogPricing = z.infer<typeof catalogPricingSchema>

// OpenRouter's generic usage counters combine text + image prompt tokens. They can
// be priced from a catalogue only if every possible route charges the same token rate.
function uniqueRate(rates: CatalogRate[], dimension: string) {
  const matches = rates.filter(r => r.billable === dimension)
  if (matches.length !== 1 || matches[0].variant !== undefined || matches[0].unit !== 'token') return null
  return matches[0].cost_usd * 1e6
}

function commonRate(rates: (number | null)[]) {
  return rates.length && rates.every(rate => rate === rates[0]) ? rates[0] : null
}

export function catalogTokenPrices(pricing?: CatalogPricing) {
  const endpoints = pricing?.endpoints ?? []
  // An additional charge that cannot be expressed by either counter rules out a token estimate.
  const known = new Set(['input_text', 'input_image', 'output_image'])
  if (endpoints.some(p => p.rates.some(r => !known.has(r.billable) && r.cost_usd > 0))) return {}
  const input = commonRate(endpoints.map(p => commonRate([uniqueRate(p.rates, 'input_text'), uniqueRate(p.rates, 'input_image')])))
  const output = commonRate(endpoints.map(p => uniqueRate(p.rates, 'output_image')))
  return { inputTextPerM: input, outputPerM: output }
}
