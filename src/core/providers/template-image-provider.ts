import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { AppError } from '../errors'
import { serverEnv } from '../env'
import { logger } from '../logger'
import { providerTag, type GenerationProvider, type ImageRequestOptions } from '../jobs'
import { openRouterImageParameters, type OpenRouterImageParameters } from './openrouter-catalog'
import { openRouterInputMismatch } from './openrouter-input'
import { ProviderSettingError } from './setting-error'
import { activeProvider, PROVIDERS_CACHE_TAG } from './active-provider'
import { readProviderKey } from './keys'
import { findProviderRow } from './repository'
import { resolveProvider } from './resolve'
import type { ActiveProviderRow, ProviderAdapters } from './types'

async function cachedRow(id: string) {
  'use cache'
  cacheTag(PROVIDERS_CACHE_TAG)
  cacheLife({ revalidate: 60, expire: 300 })
  return findProviderRow(createAdminSupabase(), id)
}

type RoutingDeps = {
  lookup?: typeof cachedRow
  fallback?: () => Promise<GenerationProvider>
  readKey?: (id: string) => Promise<string | null>
  parameters?: typeof openRouterImageParameters
}

async function checkTemplateRow(
  row: ActiveProviderRow, request: ImageRequestOptions, load: typeof openRouterImageParameters,
): Promise<{ reason: string } | { parameters?: OpenRouterImageParameters }> {
  if (!row.resolutions.includes(request.resolution)) return { reason: 'unsupported_resolution' }
  if (row.adapter !== 'openrouter_images') return {}
  let parameters: OpenRouterImageParameters
  try {
    parameters = await load(row.baseUrl, row.model)
  } catch (error) {
    const missing = error instanceof ProviderSettingError && error.reason === 'openrouter_model_missing'
    return { reason: missing ? 'model_missing' : 'catalog_unavailable' }
  }
  const mismatch = openRouterInputMismatch(request, parameters)
  return mismatch ?? { parameters }
}

// Resolve before reserving credits or the trial budget so the ledger and price snapshot
// both belong to the provider that actually receives the request.
export async function templateImageProvider(
  adapters: ProviderAdapters,
  id?: string | null,
  request?: ImageRequestOptions,
  { lookup = cachedRow, fallback = () => activeProvider('image', adapters),
    readKey = (keyId) => readProviderKey(createAdminSupabase(), keyId),
    parameters: loadParameters = openRouterImageParameters }: RoutingDeps = {},
) {
  if (!id || !request) return fallback()
  const row = await lookup(id)
  if (row.adapter === 'openai_responses') throw new AppError('INVALID_INPUT', 'An image provider is required')
  const selection = await checkTemplateRow(row, request, loadParameters)
  if ('reason' in selection) {
    const provider = await fallback()
    logger.info('image.provider.fallback', {
      reason: selection.reason, requestedProvider: providerTag(id, row.model), actualProvider: provider.id,
      resolution: request.resolution, aspectRatio: request.aspectRatio, referenceCount: request.images.length,
    })
    return provider
  }
  return resolveProvider('image', row, serverEnv(), adapters, readKey, selection.parameters)
}
