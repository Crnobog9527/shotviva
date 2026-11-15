import 'server-only'

import { cachedActiveDishware, loadActiveDishware } from '@/core/dishware'
import type { DishReader, FoodDeps } from '@/core/jobs'
import { logger } from '@/core/logger'
import { activeCredentials, type ProviderAdapterId, type ProviderConfig } from '@/core/providers'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createOpenAIDishReader } from './openai-dish-reader'

// Dish reader adapters by the id a 'dish_read' or 'decision' row names (ARCHITECTURE §3.3).
export const DISH_READER_ADAPTERS: Partial<Record<ProviderAdapterId, (config: ProviderConfig, tag: string) => DishReader>> = {
  openai_responses: (config, tag) => createOpenAIDishReader(config, tag),
}

// The active 'dish_read' row (its own, stronger model; Owner 2026-11-15), else the 'decision'
// row, so the judge keeps its cheaper model. Null when neither is switched on or the row cannot be
// built: a food flow then runs flow 1. Prices come from the row that reads.
export async function dishReader(loadRow?: Parameters<typeof activeCredentials>[1]): Promise<DishReader | null> {
  try {
    const credentials = (await activeCredentials('dish_read', loadRow)) ?? (await activeCredentials('decision', loadRow))
    if (!credentials) return null
    const build = DISH_READER_ADAPTERS[credentials.adapter]
    if (!build) throw new Error(`adapter ${credentials.adapter} is not a dish reader`)
    return { ...build(credentials.config, credentials.tag), prices: credentials.prices }
  } catch (error) {
    logger.error('dish reader unavailable; food flows run with both toggles off', { error })
    return null
  }
}

// For /api/generate and the admin test runs: the library through Next's cache.
export function foodDeps(): FoodDeps {
  return { reader: () => dishReader(), vessels: cachedActiveDishware }
}

// For the templates:trial script, outside Next's cache.
export function scriptFoodDeps(db: SupabaseClient, loadRow: Parameters<typeof activeCredentials>[1]): FoodDeps {
  return { reader: () => dishReader(loadRow), vessels: () => loadActiveDishware(db) }
}
