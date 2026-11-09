import { z } from 'zod'

import { OPENROUTER_TOP_UP_FACTOR } from '../jobs/openrouter-fee'
import { catalogRateSchema, type CatalogPricing, type CatalogRate } from '../templates/catalog-pricing'
import type { EstimatedImageCosts, ImageCapabilities } from '../templates/image-capabilities'
import type { Resolution } from '../templates/output-options'
import { OPENROUTER_IMAGE_SIZE } from './openrouter-input'

const endpointList = z.object({
  id: z.string(),
  endpoints: z.array(z.object({
    provider_name: z.string().min(1).max(100),
    pricing: z.array(catalogRateSchema).nullish(),
  })),
})

export function parseEndpointPrices(model: string, data: unknown): CatalogPricing {
  const { data: list } = endpointList.safeParse(data)
  if (!list || list.id !== model) return { status: 'unavailable', endpoints: [] }
  const endpoints = list.endpoints.map(p => ({ name: p.provider_name, rates: p.pricing ?? [] }))
  return { status: endpoints.some(p => p.rates.length) ? 'quoted' : 'unpriced', endpoints }
}

function hasVariableCharges(rates: CatalogRate[], usesReferences: boolean) {
  // An output rate alone does not establish reference input pricing.
  if (usesReferences && !rates.some(r => r.billable === 'input_image' && r.variant === undefined && r.cost_usd === 0)) return true
  return rates.some(r => r.cost_usd > 0 && (r.billable !== 'output_image' || r.unit !== 'image'))
}

function tierPrice(rates: CatalogRate[], tier: Resolution, usesReferences: boolean) {
  if (hasVariableCharges(rates, usesReferences)) return null
  const output = rates.filter(r => r.billable === 'output_image' && r.unit === 'image')
  // An unrecognised variant could be a quality or mode surcharge, not a different size.
  if (output.some(r => r.variant && !/^\d+(\.\d+)?k?$/i.test(r.variant))) return null
  const variant = output.filter(r => r.variant?.toUpperCase() === OPENROUTER_IMAGE_SIZE[tier])
  const matches = variant.length ? variant : output.filter(r => r.variant === undefined)
  return matches.length === 1 && matches[0].cost_usd > 0 ? matches[0].cost_usd : null
}

export function catalogImageEstimates(quote: CatalogPricing, caps: Pick<ImageCapabilities, 'resolutions' | 'maxReferences'>): EstimatedImageCosts {
  const costs: EstimatedImageCosts = {}
  if (quote.status !== 'quoted') return costs
  for (const tier of caps.resolutions) {
    const rates = quote.endpoints.map(p => tierPrice(p.rates, tier, caps.maxReferences > 0))
    if (rates.length && rates.every((rate): rate is number => rate !== null)) {
      const usd = Math.max(...rates) * OPENROUTER_TOP_UP_FACTOR
      if (Number.isFinite(usd)) costs[tier] = usd
    }
  }
  return costs
}
