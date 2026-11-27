import type { SupabaseClient } from '@supabase/supabase-js'

import { serverEnv } from '../../src/core/env'
import { defaultTemplateProvider, readProviderKey, resolveProvider, templateImageProvider } from '../../src/core/providers'
import { openRouterImageParameters } from '../../src/core/providers/openrouter-catalog'
import { findProviderRow, loadActiveProviderRow } from '../../src/core/providers/repository'
import type { ProviderModule } from '../../src/core/providers/types'
import { identityJudge } from '../../src/modules/image/edit/classifier-provider'
import { scriptFoodDeps } from '../../src/modules/image/food/food-deps'
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

// A run makes hundreds of calls, and each one looked its provider row and Vault key up again (about
// 2 ai_providers reads and 1 provider_api_key call per trial: ~3k requests a day on the test
// database while tuning, 2026-11-27). This process keeps each answer for HOLD_MS, in its own memory
// only (never written anywhere, never shared with another process): an admin change to a route
// reaches a run within a minute. A failed read is not kept.
export const HOLD_MS = 60_000

export function heldFor<A, T>(read: (arg: A) => Promise<T>, ms = HOLD_MS, now = Date.now): (arg: A) => Promise<T> {
  const held = new Map<A, { at: number; value: Promise<T> }>()
  return (arg) => {
    const entry = held.get(arg)
    if (entry && now() - entry.at < ms) return entry.value
    const value = read(arg)
    held.set(arg, { at: now(), value })
    value.catch(() => { if (held.get(arg)?.value === value) held.delete(arg) })
    return value
  }
}

export function scriptProviders(db: SupabaseClient) {
  const loadRow = heldFor((module: ProviderModule) => loadActiveProviderRow(db, module))
  const readKey = heldFor((id: string) => readProviderKey(db, id))
  const findRow = heldFor((providerId: string) => findProviderRow(db, providerId))
  const provider = refuseFallback((id, request) => templateImageProvider(IMAGE_ADAPTERS, id, request, {
    lookup: findRow,
    fallback: () => defaultTemplateProvider(IMAGE_ADAPTERS, request, loadRow),
    readKey,
    parameters: (baseUrl, model) => openRouterImageParameters(baseUrl, model, fetch),
  }))
  // For estimates: the provider a cell will call, the bound one or the site default, never both
  // (a bound template's trial refuses a fallback).
  const bound = async (id: string | null): Promise<EstimateSource> => {
    if (!id) return defaultTemplateProvider(IMAGE_ADAPTERS, undefined, loadRow)
    const row = await findRow(id)
    const provider = await resolveProvider('image', row, serverEnv(), IMAGE_ADAPTERS, readKey)
    return { prices: provider.prices, estimatedImageCosts: row.estimatedImageCosts }
  }
  return { provider, bound, judge: () => identityJudge(loadRow), food: scriptFoodDeps(db, loadRow) }
}
