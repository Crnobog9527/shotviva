import 'server-only'

import { z } from 'zod'

import { catalogPriceSchema, type CatalogPrice } from '../jobs/catalog-price'
import type { ProviderPrices } from '../jobs'
import { getCatalogJson } from './catalog-request'
import { openRouterCatalogPricing } from './openrouter-catalog'
import { catalogModelFor } from './catalog-model'
import { OPENROUTER_BASE_URL, type ProviderAdapterId } from './types'

// Reads a line's per-million-token prices from OpenRouter's public model catalogue (ARCHITECTURE
// §10.0; Owner 2026-11-15: no price table in code). Text models: the model-level price of
// GET /models, which is the vendor's standard rate (a BYOK line bills exactly that upstream).
// Official OpenAI image models: the token rates of GET /images/models/openai/<model>/endpoints.
// Public metadata only: no key is ever sent.

const MODELS_URL = `${OPENROUTER_BASE_URL}/models`
const rate = z.string().regex(/^\d+(\.\d+)?(e-?\d+)?$/i).transform(Number)
const modelList = z.object({
  data: z.array(z.object({ id: z.string(), pricing: z.object({ prompt: rate.optional(), completion: rate.optional() }).passthrough().nullish().catch(null) })),
})

// USD per token → USD per million tokens, rounded off float noise (0.000002 * 1e6 = 1.9999999999999998).
const perMillion = (usdPerToken: number | undefined) =>
  usdPerToken === undefined || !Number.isFinite(usdPerToken) ? null : Math.round(usdPerToken * 1e6 * 1e6) / 1e6

function snapshot(catalogModel: string, source: string, prices: ProviderPrices | null, now: Date): CatalogPrice {
  const quoted = prices !== null && Object.values(prices).some((value) => value !== null)
  return catalogPriceSchema.parse({
    status: quoted ? 'quoted' : 'missing', catalogModel, source, fetchedAt: now.toISOString(),
    prices: quoted ? prices : { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
  })
}

// Text models bill input (image input counts as input tokens) and output; the long-context
// override (above 272K input tokens) is not used: our calls are a few thousand tokens.
async function textPrice(catalogModel: string, fetchImpl: typeof fetch | undefined, now: Date): Promise<CatalogPrice> {
  const list = modelList.parse(await getCatalogJson(MODELS_URL, fetchImpl))
  const entry = list.data.find((candidate) => candidate.id === catalogModel)
  const prices = entry?.pricing
    ? { inputTextPerM: perMillion(entry.pricing.prompt), inputImagePerM: null, outputPerM: perMillion(entry.pricing.completion) }
    : null
  return snapshot(catalogModel, `https://openrouter.ai/${catalogModel}`, prices, now)
}

// One token rate per billable that every endpoint agrees on; null otherwise (the admin types it).
function agreedRate(endpoints: { rates: { billable: string; unit: string; cost_usd: number; variant?: string }[] }[], billable: string) {
  const rates = endpoints.map((endpoint) => {
    const matches = endpoint.rates.filter((r) => r.billable === billable)
    return matches.length === 1 && matches[0].unit === 'token' && matches[0].variant === undefined ? matches[0].cost_usd : null
  })
  return rates.length && rates.every((value) => value !== null && value === rates[0]) ? perMillion(rates[0]!) : null
}

async function imagePrice(catalogModel: string, fetchImpl: typeof fetch | undefined, now: Date): Promise<CatalogPrice | null> {
  const pricing = await openRouterCatalogPricing(OPENROUTER_BASE_URL, catalogModel, fetchImpl)
  if (pricing.status === 'unavailable') return null
  const prices = pricing.status === 'quoted' ? {
    inputTextPerM: agreedRate(pricing.endpoints, 'input_text'),
    inputImagePerM: agreedRate(pricing.endpoints, 'input_image'),
    outputPerM: agreedRate(pricing.endpoints, 'output_image'),
  } : null
  return snapshot(catalogModel, `https://openrouter.ai/${catalogModel}`, prices, now)
}

// The line's catalogue price now; null when the line has no catalogue (another host, Ark,
// OpenRouter image lines, whose prices live in capabilities.catalogPricing) or the catalogue could
// not be read (the caller keeps the last snapshot).
export async function fetchCatalogPrice(
  adapter: ProviderAdapterId, baseUrl: string, model: string, fetchImpl?: typeof fetch, now = new Date(),
): Promise<CatalogPrice | null> {
  const catalogModel = catalogModelFor(adapter, baseUrl, model)
  if (!catalogModel) return null
  try {
    return adapter === 'openai_images' ? await imagePrice(catalogModel, fetchImpl, now) : await textPrice(catalogModel, fetchImpl, now)
  } catch {
    return null
  }
}
