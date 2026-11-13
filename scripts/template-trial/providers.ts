import type { SupabaseClient } from '@supabase/supabase-js'

import { serverEnv } from '../../src/core/env'
import { defaultTemplateProvider, readProviderKey, resolveProvider, templateImageProvider } from '../../src/core/providers'
import { openRouterImageParameters } from '../../src/core/providers/openrouter-catalog'
import { findProviderRow, loadActiveProviderRow } from '../../src/core/providers/repository'
import type { ProviderModule } from '../../src/core/providers/types'
import { identityJudge } from '../../src/modules/image/edit/classifier-provider'
import { IMAGE_ADAPTERS } from '../../src/modules/image/provider'
import { refuseFallback } from './bound-provider'
import type { EstimateSource } from './estimate'

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
  // For estimates: the provider a cell will call, the bound one or the site default, never both
  // (a bound template's trial refuses a fallback).
  const bound = async (id: string | null): Promise<EstimateSource> => {
    if (!id) return defaultTemplateProvider(IMAGE_ADAPTERS, undefined, loadRow)
    const row = await findProviderRow(db, id)
    const provider = await resolveProvider('image', row, serverEnv(), IMAGE_ADAPTERS, readKey)
    return { prices: provider.prices, estimatedImageCosts: row.estimatedImageCosts }
  }
  return { provider, bound, judge: () => identityJudge(loadRow) }
}
