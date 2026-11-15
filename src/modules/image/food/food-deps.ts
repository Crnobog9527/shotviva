import 'server-only'

import { cachedActiveDishware, loadActiveDishware } from '@/core/dishware'
import type { DishReader, FoodDeps } from '@/core/jobs'
import { logger } from '@/core/logger'
import { activeCredentials, type ProviderAdapterId, type ProviderConfig } from '@/core/providers'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createOpenAIDishReader } from './openai-dish-reader'

// Dish reader adapters by the id a 'decision' row names (ARCHITECTURE §3.3), like the judge's.
export const DISH_READER_ADAPTERS: Partial<Record<ProviderAdapterId, (config: ProviderConfig, tag: string) => DishReader>> = {
  openai_responses: (config, tag) => createOpenAIDishReader(config, tag),
}

// Null when no decision row is switched on or it cannot be built: a food flow then runs flow 1.
export async function dishReader(loadRow?: Parameters<typeof activeCredentials>[1]): Promise<DishReader | null> {
  try {
    const credentials = await activeCredentials('decision', loadRow)
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
