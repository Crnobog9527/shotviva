import type { CatalogPrice } from '../jobs/catalog-price'
import { DEFAULT_BASE_URL, OPENROUTER_BASE_URL, type ProviderAdapterId } from './types'

// Which OpenRouter catalogue entry prices a line (ARCHITECTURE §10.0), or null when none does and
// the admin types the price in. Text lines on OpenRouter use their own model id; a line on
// OpenAI's own endpoint uses openai/<model>, the catalogue's listing of OpenAI's rate. OpenRouter
// image lines are priced from capabilities.catalogPricing instead; Ark has no public catalogue.
// Pure: the admin form and the server both use it.
export function catalogModelFor(adapter: ProviderAdapterId, baseUrl: string, model: string): string | null {
  const id = model.trim()
  if (!id) return null
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (adapter === 'openai_responses' && base === OPENROUTER_BASE_URL) return id
  if ((adapter === 'openai_responses' || adapter === 'openai_images') && base === DEFAULT_BASE_URL) return id.includes('/') ? null : `openai/${id}`
  return null
}

type PricedRow = { adapter: ProviderAdapterId; baseUrl: string; model: string; catalogPrice?: CatalogPrice | null }

// The row's stored catalogue price, only while it is still for the row's model and endpoint: a
// snapshot taken before the model or endpoint changed prices nothing.
export function currentCatalogPrice(row: PricedRow): CatalogPrice | null {
  const expected = catalogModelFor(row.adapter, row.baseUrl, row.model)
  return expected && row.catalogPrice?.catalogModel === expected ? row.catalogPrice : null
}
