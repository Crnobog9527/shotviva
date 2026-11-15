import { z } from 'zod'

import type { ProviderPrices } from './provider'

// Live model prices (ARCHITECTURE §10.0, Owner 2026-11-15): no price table in code. A line's
// per-million-token prices come from OpenRouter's public model catalogue (ai_providers.catalog_price,
// refreshed on save and daily), else from what the admin typed in from the provider's price page
// (the row's price columns). Pure data, safe in the browser: the admin form shows it.

const perM = z.number().nonnegative().finite().nullable()

export const catalogPriceSchema = z.object({
  // quoted: the catalogue lists this model with a price. missing: it does not (the admin types one in).
  status: z.enum(['quoted', 'missing']),
  // The catalogue id looked up: the line's model on OpenRouter, openai/<model> for an OpenAI line.
  catalogModel: z.string().min(1).max(200),
  source: z.string().startsWith('https://').max(500),
  fetchedAt: z.iso.datetime({ offset: true }),
  prices: z.object({ inputTextPerM: perM, inputImagePerM: perM, outputPerM: perM }),
})
export type CatalogPrice = z.infer<typeof catalogPriceSchema>

const FIELDS = ['inputTextPerM', 'inputImagePerM', 'outputPerM'] as const

// The live catalogue price when there is one; null otherwise.
export function livePrices(catalog: CatalogPrice | null | undefined): ProviderPrices | null {
  return catalog?.status === 'quoted' ? catalog.prices : null
}

// The prices a job is costed with: each field from the catalogue when it quotes one, else the
// admin's own entry. null when neither has anything, so jobCostUsd records usage but no cost.
export function effectivePrices(catalog: CatalogPrice | null | undefined, own: ProviderPrices | null | undefined): ProviderPrices | null {
  const live = livePrices(catalog)
  if (!own && !live) return null
  const merged = Object.fromEntries(FIELDS.map((field) => [field, live?.[field] ?? own?.[field] ?? null])) as ProviderPrices
  return FIELDS.some((field) => merged[field] !== null) ? merged : null
}
