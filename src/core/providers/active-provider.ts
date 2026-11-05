import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import type { GenerationProvider } from '../jobs'
import { loadActiveProviderRow } from './repository'
import { resolveProvider } from './resolve'
import type { ActiveProviderRow, ProviderAdapters, ProviderModule } from './types'

// The admin page expires this tag on every save or switch (updateTag), so the next generation
// uses the new provider without a redeploy.
export const PROVIDERS_CACHE_TAG = 'providers'

// Cached per module. Only the ciphertext is cached, never the decrypted key. The short lifetime
// bounds how long an instance that missed the tag expiry keeps the old provider.
async function cachedActiveRow(module: ProviderModule): Promise<ActiveProviderRow | null> {
  'use cache'
  cacheTag(PROVIDERS_CACHE_TAG)
  cacheLife({ revalidate: 60, expire: 300 })
  return loadActiveProviderRow(createAdminSupabase(), module)
}

// The provider for one generation request: active row, else the env fallback. `loadRow` is
// injectable so tests read the database directly instead of through Next's cache.
export async function activeProvider(
  module: ProviderModule,
  adapters: ProviderAdapters,
  loadRow: (module: ProviderModule) => Promise<ActiveProviderRow | null> = cachedActiveRow,
): Promise<GenerationProvider> {
  return resolveProvider(module, await loadRow(module), serverEnv(), adapters)
}
