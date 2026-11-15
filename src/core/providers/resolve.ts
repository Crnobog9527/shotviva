import 'server-only'

import type { ServerEnv } from '../env'
import { AppError } from '../errors'
import { effectivePrices, ENV_PROVIDER_SOURCE, providerTag, type GenerationProvider, type ProviderPrices } from '../jobs'
import { catalogTokenPrices } from '../templates/catalog-pricing'
import { currentCatalogPrice } from './catalog-model'
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
  references: Pick<GenerationProvider, 'minReferences' | 'maxReferences'>,
) {
  const adapter = adapters[adapterId]
  if (!adapter) throw new AppError('INTERNAL', `provider adapter ${adapterId} is not registered`)
  const provider = adapter(config)
  return { id: providerTag(source, config.model), prices, ...references,
    ...(provider.honoursBackground ? { honoursBackground: true } : {}),
    ...(provider.accepts ? { accepts: provider.accepts.bind(provider) } : {}),
    completeUsage: provider.completeUsage?.bind(provider), generate: provider.generate.bind(provider) } satisfies GenerationProvider
}

function savedMaximum(row: ActiveProviderRow) {
  return row.capabilities?.maxReferences ?? (row.adapter === 'openai_images' ? OPENAI_MAX_REFERENCES : undefined)
}

export function effectiveReferenceRange(row: ActiveProviderRow, parameters?: ProviderConfig['imageParameters']) {
  const stored = row.capabilities
  const minReferences = Math.max(stored?.minReferences ?? 0, parameters?.input_references?.min ?? 0)
  const storedMax = savedMaximum(row)
  const maxReferences = parameters ? Math.min(storedMax ?? Infinity, parameters.input_references?.max ?? 0) : storedMax
  return { minReferences, maxReferences }
}

// The prices a job on this row is costed with (ARCHITECTURE §10.0): the live catalogue price, each
// empty field filled from the admin's own entry. OpenRouter image lines read the catalogue quote
// kept in their capabilities; other lines the catalogue snapshot (catalog_price). Ark is billed per
// image from its admin-entered list price in the adapter, so it has no token prices.
export function rowPrices(row: ActiveProviderRow): ProviderPrices | null {
  if (row.adapter !== 'openrouter_images') return effectivePrices(currentCatalogPrice(row), row.prices)
  const automatic = catalogTokenPrices(row.capabilities?.catalogPricing)
  return {
    inputTextPerM: row.prices.inputTextPerM ?? automatic.inputTextPerM ?? null,
    inputImagePerM: row.prices.inputImagePerM,
    outputPerM: row.prices.outputPerM ?? automatic.outputPerM ?? null,
  }
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
    // The env fallback has no row to hold a price, so its jobs record usage but no cost.
    return build(adapters, fallback.adapter, ENV_PROVIDER_SOURCE, fallback.config, null, { minReferences: 0, maxReferences: OPENAI_MAX_REFERENCES })
  }
  // No silent fallback to env: a provider the Owner switched to must be the one that runs.
  const apiKey = await readKey(row.id)
  if (!apiKey) throw new AppError('INTERNAL', `active provider ${row.id} has no API key; set it in /admin/providers`)
  const references = effectiveReferenceRange(row, imageParameters)
  return build(adapters, row.adapter, row.id, { baseUrl: row.baseUrl, model: row.model, apiKey, resolutions: row.resolutions, imageParameters,
    ...(row.adapter === 'ark_images' ? { listPrice: row.listPrice ?? null } : {}) }, rowPrices(row), references)
}
