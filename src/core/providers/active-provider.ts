import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { AppError } from '../errors'
import { effectivePrices, providerTag, type GenerationProvider, type ImageRequestOptions, type ProviderPrices } from '../jobs'
import { ARK_RESOLUTIONS } from './ark'
import { openRouterImageParameters } from './openrouter-catalog'
import { PROVIDERS_CACHE_TAG } from './cache-tag'
import { readProviderKey } from './keys'
import { loadActiveProviderRow } from './repository'
import { resolveProvider, type ReadProviderKey } from './resolve'
import type { ActiveProviderRow, ProviderAdapterId, ProviderAdapters, ProviderConfig, ProviderModule } from './types'

// The admin page expires this tag on every save or switch (updateTag), so the next generation
// uses the new provider without a redeploy.
export { PROVIDERS_CACHE_TAG } from './cache-tag'

// Cached per module. The row has no key, so nothing secret is cached. The short lifetime
// bounds how long an instance that missed the tag expiry keeps the old provider.
async function cachedActiveRow(module: ProviderModule): Promise<ActiveProviderRow | null> {
  'use cache'
  cacheTag(PROVIDERS_CACHE_TAG)
  cacheLife({ revalidate: 60, expire: 300 })
  return loadActiveProviderRow(createAdminSupabase(), module)
}

// The provider for one generation request: active row (key read from Vault now), else the env
// fallback. `loadRow` / `readKey` are injectable so tests skip Next's cache.
export async function activeProvider(
  module: ProviderModule,
  adapters: ProviderAdapters,
  loadRow: (module: ProviderModule) => Promise<ActiveProviderRow | null> = cachedActiveRow,
  readKey: ReadProviderKey = (id) => readProviderKey(createAdminSupabase(), id),
): Promise<GenerationProvider> {
  return resolveProvider(module, await loadRow(module), serverEnv(), adapters, readKey)
}

// Freeze the default model’s live range before a template job reserves credits or trial budget.
// A trial can explicitly omit all references, so zero-input requests also need this check.
// `request`: the job being routed (undefined when only resolving for an estimate).
// `loadRow` is injectable for callers outside Next's cache (the templates:trial script).
export async function defaultTemplateProvider(adapters: ProviderAdapters, request: ImageRequestOptions | undefined,
  loadRow: (module: ProviderModule) => Promise<ActiveProviderRow | null> = cachedActiveRow): Promise<GenerationProvider> {
  const row = await loadRow('image')
  // Ark has no 4K tier: refuse it here, before any credits are held, rather than in the adapter.
  if (request && row?.adapter === 'ark_images' && !ARK_RESOLUTIONS.includes(request.resolution)) {
    throw new AppError('INVALID_INPUT', 'This model does not support the selected output size')
  }
  const parameters = request && row?.adapter === 'openrouter_images'
    ? await openRouterImageParameters(row.baseUrl, row.model) : undefined
  return resolveProvider('image', row, serverEnv(), adapters, (id) => readProviderKey(createAdminSupabase(), id), parameters)
}

// `prices`: the row's own, empty ones filled from MODEL_PRICES; null when neither has any.
export type ProviderCredentials = { tag: string; adapter: ProviderAdapterId; config: ProviderConfig; prices: ProviderPrices | null }

// For a module that is not a GenerationProvider and has no env fallback ('decision', T30): the
// active row with its key, or null when none is switched on. The module builds its own adapter.
export async function activeCredentials(
  module: ProviderModule,
  loadRow: (module: ProviderModule) => Promise<ActiveProviderRow | null> = cachedActiveRow,
  readKey: ReadProviderKey = (id) => readProviderKey(createAdminSupabase(), id),
): Promise<ProviderCredentials | null> {
  const row = await loadRow(module)
  if (!row) return null
  const apiKey = await readKey(row.id)
  if (!apiKey) throw new AppError('INTERNAL', `active ${module} provider ${row.id} has no API key`)
  return { tag: providerTag(row.id, row.model), adapter: row.adapter, config: { baseUrl: row.baseUrl, model: row.model, apiKey }, prices: effectivePrices(row.model, row.prices) }
}
