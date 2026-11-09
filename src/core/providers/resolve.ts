import 'server-only'

import type { ServerEnv } from '../env'
import { AppError } from '../errors'
import { effectivePrices, ENV_PROVIDER_SOURCE, providerTag, type GenerationProvider, type ProviderPrices } from '../jobs'
import { OPENAI_MAX_REFERENCES } from '../templates/image-capabilities'
import { DEFAULT_BASE_URL, type ActiveProviderRow, type ProviderAdapters, type ProviderConfig, type ProviderModule } from './types'

// Turns the active ai_providers row (or, without one, the env fallback) into the adapter that
// generates this request (ARCHITECTURE §3.3). The key comes from Vault for this request only
// and lives in the adapter's closure.

export type ReadProviderKey = (id: string) => Promise<string | null>

type EnvFallback = { adapter: 'openai_images'; config: ProviderConfig }

// Only the image module has an env fallback: the OPENAI_* variables that predate T17.
function envFallback(module: ProviderModule, env: ServerEnv): EnvFallback {
  if (module !== 'image') throw new AppError('INTERNAL', `no provider configured for ${module}`)
  if (!env.OPENAI_API_KEY) throw new AppError('INTERNAL', 'No active image provider and OPENAI_API_KEY is not configured')
  return { adapter: 'openai_images', config: { baseUrl: DEFAULT_BASE_URL, model: env.OPENAI_IMAGE_MODEL, apiKey: env.OPENAI_API_KEY } }
}

function build(
  adapters: ProviderAdapters,
  adapterId: keyof ProviderAdapters,
  source: string,
  config: ProviderConfig,
  prices: ProviderPrices | null,
  maxReferences?: number,
) {
  const adapter = adapters[adapterId]
  if (!adapter) throw new AppError('INTERNAL', `provider adapter ${adapterId} is not registered`)
  const provider = adapter(config)
  // Row prices first, then the official price table for the model (ARCHITECTURE §10.0).
  const snapshot = effectivePrices(config.model, prices)
  return { id: providerTag(source, config.model), prices: snapshot, maxReferences, generate: provider.generate.bind(provider) } satisfies GenerationProvider
}

export function effectiveReferenceLimit(row: ActiveProviderRow, parameters?: ProviderConfig['imageParameters']) {
  const stored = row.capabilities?.maxReferences
  if (row.adapter === 'openai_images') return stored ?? OPENAI_MAX_REFERENCES
  if (!parameters) return stored
  return Math.min(stored ?? Infinity, parameters.input_references?.max ?? 0)
}

export async function resolveProvider(
  module: ProviderModule,
  row: ActiveProviderRow | null,
  env: ServerEnv,
  adapters: ProviderAdapters,
  readKey: ReadProviderKey,
  imageParameters?: ProviderConfig['imageParameters'],
): Promise<GenerationProvider> {
  if (!row) {
    const fallback = envFallback(module, env)
    // The env fallback has no row to hold prices; its model's official prices still apply.
    return build(adapters, fallback.adapter, ENV_PROVIDER_SOURCE, fallback.config, null, OPENAI_MAX_REFERENCES)
  }
  // No silent fallback to env: a provider the Owner switched to must be the one that runs.
  const apiKey = await readKey(row.id)
  if (!apiKey) throw new AppError('INTERNAL', `active provider ${row.id} has no API key; set it in /admin/providers`)
  const maxReferences = effectiveReferenceLimit(row, imageParameters)
  return build(adapters, row.adapter, row.id, { baseUrl: row.baseUrl, model: row.model, apiKey, resolutions: row.resolutions, imageParameters }, row.prices, maxReferences)
}
