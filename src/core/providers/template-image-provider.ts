import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { AppError } from '../errors'
import { serverEnv } from '../env'
import { logger } from '../logger'
import { referenceCount } from '../jobs/provider'
import { providerTag, type GenerationProvider, type ImageRequestOptions } from '../jobs'
import { openRouterImageParameters, type OpenRouterImageParameters } from './openrouter-catalog'
import { openRouterInputMismatch } from './openrouter-input'
import { ProviderSettingError } from './setting-error'
import { defaultTemplateProvider, PROVIDERS_CACHE_TAG } from './active-provider'
import { readProviderKey } from './keys'
import { findProviderRow } from './repository'
import { effectiveReferenceRange, resolveProvider } from './resolve'
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

function validateStoredCapabilities(row: ActiveProviderRow, request: ImageRequestOptions) {
  const caps = row.capabilities
  if (!caps) return
  const fixed: readonly string[] = caps.providerAspectRatios ?? caps.aspectRatios
  const aspect = request.aspectRatio === 'original'
    ? caps.originalRatio
    : fixed.includes(request.aspectRatio)
  if (!aspect || !caps.resolutions.includes(request.resolution)) {
    throw new AppError('INVALID_INPUT', 'This model does not support the selected output size')
  }
  if (referenceCount(request) < caps.minReferences) {
    throw new AppError('INVALID_INPUT', 'This model does not support the supplied reference count')
  }
}

function lostOriginalSupport(row: ActiveProviderRow, aspect: string, parameters: OpenRouterImageParameters) {
  return row.capabilities?.originalRatio && aspect === 'original' && !parameters.aspect_ratio?.values.includes('auto')
}

async function checkTemplateRow(
  row: ActiveProviderRow, request: ImageRequestOptions, load: typeof openRouterImageParameters,
): Promise<{ reason: string } | { parameters?: OpenRouterImageParameters }> {
  if (!row.resolutions.includes(request.resolution)) return { reason: 'unsupported_resolution' }
  const { maxReferences: max } = effectiveReferenceRange(row)
  if (max !== undefined && referenceCount(request) > max) return { reason: 'reference_image_limit' }
  if (row.adapter !== 'openrouter_images') return {}
  let parameters: OpenRouterImageParameters
  try {
    parameters = await load(row.baseUrl, row.model)
  } catch (error) {
    const missing = error instanceof ProviderSettingError && error.reason === 'openrouter_model_missing'
    return { reason: missing ? 'model_missing' : 'catalog_unavailable' }
  }
  if (lostOriginalSupport(row, request.aspectRatio, parameters)) {
    return { reason: 'catalog_changed' }
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
  { lookup = cachedRow, fallback = () => defaultTemplateProvider(adapters, request !== undefined),
    readKey = (keyId) => readProviderKey(createAdminSupabase(), keyId),
    parameters: loadParameters = openRouterImageParameters }: RoutingDeps = {},
) {
  if (!id || !request) return fallback()
  const row = await lookup(id)
  if (row.adapter === 'openai_responses') throw new AppError('INVALID_INPUT', 'An image provider is required')
  validateStoredCapabilities(row, request)
  const selection = await checkTemplateRow(row, request, loadParameters)
  if ('reason' in selection) {
    const provider = await fallback()
    logger.info('image.provider.fallback', {
      reason: selection.reason, requestedProvider: providerTag(id, row.model), actualProvider: provider.id,
      resolution: request.resolution, aspectRatio: request.aspectRatio, referenceCount: referenceCount(request),
    })
    return { ...provider, fallbackReason: selection.reason }
  }
  return resolveProvider('image', row, serverEnv(), adapters, readKey, selection.parameters)
}
