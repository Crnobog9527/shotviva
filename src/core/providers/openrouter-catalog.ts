import 'server-only'

import { z } from 'zod'

import { RESOLUTIONS, type Resolution } from '../templates/output-options'
import type { CatalogPricing } from '../templates/catalog-pricing'
import { getCatalogJson } from './catalog-request'
import { parseEndpointPrices } from './openrouter-pricing'
import { OPENROUTER_IMAGE_SIZE } from './openrouter-input'
import { ProviderSettingError } from './setting-error'

const enumParameter = z.object({ type: z.literal('enum'), values: z.array(z.string()) })
const referenceRange = z.object({
  type: z.literal('range'),
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
})
const imageParameters = z.object({
  resolution: enumParameter.optional(),
  aspect_ratio: enumParameter.optional(),
  output_format: enumParameter.optional(),
  input_references: referenceRange.optional(),
}).refine(value => Object.keys(value).length > 0)
export type OpenRouterImageParameters = z.infer<typeof imageParameters>

const modelList = z.object({
  data: z.array(z.object({
    id: z.string(),
    architecture: z.unknown().optional(),
    supported_parameters: z.unknown().optional(),
  })),
})

// Callers validate the public base URL first. Only public model metadata enters the
// cache. A missing model is distinct from an unreachable or malformed catalogue.
export async function openRouterImageParameters(baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<OpenRouterImageParameters> {
  let entries
  try {
    entries = modelList.parse(await getCatalogJson(`${baseUrl}/images/models`, fetchImpl)).data
  } catch {
    throw new ProviderSettingError('openrouter_catalog_unavailable', 'Cannot load the OpenRouter image catalogue')
  }
  const entry = entries.find((candidate) => candidate.id === model)
  if (!entry) throw new ProviderSettingError('openrouter_model_missing', 'Unknown OpenRouter image model')
  const parsed = imageParameters.safeParse(entry.supported_parameters)
  if (!parsed.success) throw new ProviderSettingError('openrouter_catalog_unavailable', 'Invalid OpenRouter image parameters')
  const modalities = z.object({ input_modalities: z.array(z.string()) }).safeParse(entry.architecture).data
  if (modalities?.input_modalities.includes('image') && !parsed.data.input_references) {
    throw new ProviderSettingError('openrouter_catalog_unavailable', 'Image input advertised without a reference range')
  }
  return parsed.data
}

export async function openRouterModelTiers(baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<Resolution[] | null> {
  const { resolution } = await openRouterImageParameters(baseUrl, model, fetchImpl)
  const tiers = RESOLUTIONS.filter((tier) => resolution?.values.includes(OPENROUTER_IMAGE_SIZE[tier]))
  return tiers.length ? tiers : null
}

// Only derive paths on the configured host. Never follow a URL found in a catalogue.
export async function openRouterCatalogPricing(baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<CatalogPricing> {
  const parts = model.split('/')
  if (!parts.every(part => /^[a-zA-Z0-9_:@+-][a-zA-Z0-9._:@+-]*$/.test(part))) {
    return { status: 'unavailable', endpoints: [] }
  }
  try {
    const path = parts.map(encodeURIComponent).join('/')
    const result = await getCatalogJson(`${baseUrl}/images/models/${path}/endpoints`, fetchImpl)
    return parseEndpointPrices(model, result)
  } catch {
    // A relay may serve capabilities without the optional pricing endpoint.
    return { status: 'unavailable', endpoints: [] }
  }
}
