import type { SupabaseClient } from '@supabase/supabase-js'

import { serverEnv } from '../../src/core/env'
import type { GenerationProvider } from '../../src/core/jobs'
import { defaultTemplateProvider, readProviderKey, resolveProvider, templateImageProvider } from '../../src/core/providers'
import { openRouterImageParameters } from '../../src/core/providers/openrouter-catalog'
import { findProviderRow, loadActiveProviderRow } from '../../src/core/providers/repository'
import type { ProviderModule } from '../../src/core/providers/types'
import { identityJudge } from '../../src/modules/image/edit/classifier-provider'
import { IMAGE_ADAPTERS } from '../../src/modules/image/provider'
import { refuseFallback } from './bound-provider'

// The routes' provider and face-swap judge, reading the provider rows straight from the database:
// the app reads them through Next's cache ('use cache'), which a script does not have. Same
// functions, same routing and fallbacks (templateImageProvider, defaultTemplateProvider,
// activeCredentials); only the row lookup differs. Two script-only rules:
// - The OpenRouter catalogue is fetched directly: the app's copy goes through 'use cache', and
//   cacheTag() throws outside Next, which made every OpenRouter template look unavailable.
// - A template bound to a provider never falls back to the default model (bound-provider.ts).

export function scriptProviders(db: SupabaseClient) {
  const loadRow = (module: ProviderModule) => loadActiveProviderRow(db, module)
  const readKey = (id: string) => readProviderKey(db, id)
  const provider = refuseFallback((id, request) => templateImageProvider(IMAGE_ADAPTERS, id, request, {
    lookup: providerId => findProviderRow(db, providerId),
    fallback: () => defaultTemplateProvider(IMAGE_ADAPTERS, request, loadRow),
    readKey,
    parameters: (baseUrl, model) => openRouterImageParameters(baseUrl, model, fetch),
  }))
  // For estimates: the bound provider as configured, and the default it can fall back to.
  const bound = async (id: string | null): Promise<GenerationProvider[]> => {
    const fallback = await defaultTemplateProvider(IMAGE_ADAPTERS, undefined, loadRow)
    if (!id) return [fallback]
    return [await resolveProvider('image', await findProviderRow(db, id), serverEnv(), IMAGE_ADAPTERS, readKey), fallback]
  }
  return { provider, bound, judge: () => identityJudge(loadRow) }
}
