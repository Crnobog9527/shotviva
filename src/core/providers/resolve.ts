import 'server-only'

import type { ServerEnv } from '../env'
import { AppError } from '../errors'
import { ENV_PROVIDER_SOURCE, providerTag, type GenerationProvider } from '../jobs'
import { decryptSecret, parseSecretsKey } from './secrets'
import { DEFAULT_BASE_URL, type ActiveProviderRow, type ProviderAdapters, type ProviderConfig, type ProviderModule } from './types'

// Turns the active ai_providers row (or, without one, the env fallback) into the adapter that
// generates this request (ARCHITECTURE §3.3). The decrypted key lives only in the adapter's
// closure for this request.

type EnvFallback = { adapter: 'openai_images'; config: ProviderConfig }

// Only the image module has an env fallback: the OPENAI_* variables that predate T17.
function envFallback(module: ProviderModule, env: ServerEnv): EnvFallback {
  if (module !== 'image') throw new AppError('INTERNAL', `no provider configured for ${module}`)
  if (!env.OPENAI_API_KEY) throw new AppError('INTERNAL', 'No active image provider and OPENAI_API_KEY is not configured')
  return { adapter: 'openai_images', config: { baseUrl: DEFAULT_BASE_URL, model: env.OPENAI_IMAGE_MODEL, apiKey: env.OPENAI_API_KEY } }
}

function build(adapters: ProviderAdapters, adapterId: keyof ProviderAdapters, source: string, config: ProviderConfig) {
  const adapter = adapters[adapterId]
  if (!adapter) throw new AppError('INTERNAL', `provider adapter ${adapterId} is not registered`)
  const provider = adapter(config)
  return { id: providerTag(source, config.model), generate: provider.generate.bind(provider) } satisfies GenerationProvider
}

export function resolveProvider(
  module: ProviderModule,
  row: ActiveProviderRow | null,
  env: ServerEnv,
  adapters: ProviderAdapters,
): GenerationProvider {
  if (!row) {
    const fallback = envFallback(module, env)
    return build(adapters, fallback.adapter, ENV_PROVIDER_SOURCE, fallback.config)
  }
  const apiKey = decryptSecret(row.apiKeyCiphertext, parseSecretsKey(env.PROVIDER_SECRETS_KEY))
  return build(adapters, row.adapter, row.id, { baseUrl: row.baseUrl, model: row.model, apiKey })
}
