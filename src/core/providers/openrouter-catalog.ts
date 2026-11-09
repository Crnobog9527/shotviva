import 'server-only'

import { cacheLife } from 'next/cache'
import { z } from 'zod'

import { RESOLUTIONS, type Resolution } from '../templates/output-options'
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
})
export type OpenRouterImageParameters = z.infer<typeof imageParameters>

const modelList = z.object({
  data: z.array(z.object({
    id: z.string(),
    supported_parameters: z.unknown().optional(),
  })),
})
const upstreamTiers = { '1k': '1K', '2k': '2K', '3k': '4K' } as const

async function fetchCatalog(baseUrl: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${baseUrl}/images/models`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store',
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Image model catalogue unavailable')
  }
  const { data } = modelList.parse(await response.json())
  return data
}

async function cachedCatalog(baseUrl: string) {
  'use cache'
  cacheLife({ revalidate: 3599, expire: 3600 })
  return fetchCatalog(baseUrl, fetch)
}

// Callers validate the public base URL first. Only public model metadata enters the
// cache. A missing model is distinct from an unreachable or malformed catalogue.
export async function openRouterImageParameters(baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<OpenRouterImageParameters> {
  let entries
  try {
    entries = fetchImpl ? await fetchCatalog(baseUrl, fetchImpl) : await cachedCatalog(baseUrl)
  } catch {
    throw new ProviderSettingError('openrouter_catalog_unavailable', 'Cannot load the OpenRouter image catalogue')
  }
  const entry = entries.find((candidate) => candidate.id === model)
  if (!entry) throw new ProviderSettingError('openrouter_model_missing', 'Unknown OpenRouter image model')
  const parsed = imageParameters.safeParse(entry.supported_parameters ?? {})
  if (!parsed.success) throw new ProviderSettingError('openrouter_catalog_unavailable', 'Invalid OpenRouter image parameters')
  return parsed.data
}

export async function openRouterModelTiers(baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<Resolution[] | null> {
  const { resolution } = await openRouterImageParameters(baseUrl, model, fetchImpl)
  const tiers = RESOLUTIONS.filter((tier) => resolution?.values.includes(upstreamTiers[tier]))
  return tiers.length ? tiers : null
}
