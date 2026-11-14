import { z } from 'zod'

import { OPENROUTER_TOP_UP_FACTOR } from '../jobs/openrouter-fee'
import { catalogRateSchema, type CatalogPricing, type CatalogRate } from '../templates/catalog-pricing'
import type { EstimatedImageCosts, ImageCapabilities } from '../templates/image-capabilities'
import type { Resolution } from '../templates/output-options'
import { OPENAI_ESTIMATES } from '../templates/provider-pricing'
import { OPENROUTER_IMAGE_SIZE } from './openrouter-input'
import { openAIFreeSizeModel } from './tier-support'

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

// OpenAI's list token rates behind OPENAI_ESTIMATES (gpt-image-2 family, USD per token).
const OPENAI_LIST_RATES: Record<string, number> = { input_image: 8e-6, input_text: 5e-6, output_image: 30e-6 }

// OpenRouter bills OpenAI's GPT image models per token, so no per-image rate exists. Their cost
// per image is the official line's estimate (high quality, the dearer of the two the site sells,
// prompt and input images included), scaled up when a route's token rates exceed OpenAI's list.
function openAITokenScale(rates: CatalogRate[]) {
  if (!rates.length) return null
  let scale = 0
  for (const rate of rates) {
    const list = OPENAI_LIST_RATES[rate.billable]
    if (rate.cost_usd === 0) continue
    if (rate.unit !== 'token' || rate.variant !== undefined || list === undefined) return null
    scale = Math.max(scale, rate.cost_usd / list)
  }
  return scale > 0 ? scale : null
}

function openAIEstimates(quote: CatalogPricing, resolutions: readonly Resolution[]): EstimatedImageCosts {
  const scales = quote.endpoints.map(p => openAITokenScale(p.rates))
  if (!scales.length || !scales.every((s): s is number => s !== null)) return {}
  const scale = Math.max(1, ...scales)
  return Object.fromEntries(resolutions.map(tier => [tier, OPENAI_ESTIMATES.high[tier] * scale * OPENROUTER_TOP_UP_FACTOR]))
}

export function catalogImageEstimates(quote: CatalogPricing, caps: Pick<ImageCapabilities, 'resolutions' | 'maxReferences'>, model = ''): EstimatedImageCosts {
  const costs: EstimatedImageCosts = {}
  if (quote.status !== 'quoted') return costs
  if (model.startsWith('openai/') && openAIFreeSizeModel(model.slice('openai/'.length))) return openAIEstimates(quote, caps.resolutions)
  for (const tier of caps.resolutions) {
    const rates = quote.endpoints.map(p => tierPrice(p.rates, tier, caps.maxReferences > 0))
    if (rates.length && rates.every((rate): rate is number => rate !== null)) {
      const usd = Math.max(...rates) * OPENROUTER_TOP_UP_FACTOR
      if (Number.isFinite(usd)) costs[tier] = usd
    }
  }
  return costs
}
