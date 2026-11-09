import 'server-only'

import { cacheLife } from 'next/cache'
import { z } from 'zod'

import { RESOLUTIONS, type Resolution } from '../templates/output-options'
import { ProviderSettingError } from './setting-error'

const modelList = z.object({
  data: z.array(z.object({
    id: z.string(),
    supported_parameters: z.object({ resolution: z.unknown().optional() }).nullish(),
  })),
})
const resolutionEnum = z.object({ type: z.literal('enum'), values: z.array(z.string()) })
const upstreamTiers = { '1k': '1K', '2k': '2K', '3k': '4K' } as const

function availableTiers(parameter: unknown): Resolution[] | null {
  const result = resolutionEnum.safeParse(parameter)
  if (!result.success) return null
  const tiers = RESOLUTIONS.filter((tier) => result.data.values.includes(upstreamTiers[tier]))
  return tiers.length ? tiers : null
}

async function fetchCatalog(baseUrl: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${baseUrl}/images/models`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store',
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Image model catalogue unavailable')
  }
  const { data } = modelList.parse(await response.json())
  return data.map((entry) => ({ id: entry.id, tiers: availableTiers(entry.supported_parameters?.resolution) }))
}

async function cachedCatalog(baseUrl: string) {
  'use cache'
  cacheLife({ revalidate: 3599, expire: 3600 })
  return fetchCatalog(baseUrl, fetch)
}

// Callers validate the public base URL first. Only public IDs and supported tiers enter the
// cache; a missing model is distinct from an unreachable or malformed catalogue.
export async function openRouterModelTiers(baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<Resolution[] | null> {
  let entries
  try {
    entries = fetchImpl ? await fetchCatalog(baseUrl, fetchImpl) : await cachedCatalog(baseUrl)
  } catch {
    throw new ProviderSettingError('openrouter_catalog_unavailable', 'Cannot load the OpenRouter image catalogue')
  }
  const entry = entries.find((candidate) => candidate.id === model)
  if (!entry) throw new ProviderSettingError('openrouter_model_missing', 'Unknown OpenRouter image model')
  return entry.tiers
}
