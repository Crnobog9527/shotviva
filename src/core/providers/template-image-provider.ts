import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { AppError } from '../errors'
import { serverEnv } from '../env'
import type { Resolution } from '../templates/output-options'
import { activeProvider, PROVIDERS_CACHE_TAG } from './active-provider'
import { readProviderKey } from './keys'
import { findProviderRow } from './repository'
import { resolveProvider } from './resolve'
import type { ActiveProviderRow, ProviderAdapters } from './types'

async function cachedRow(id: string) {
  'use cache'
  cacheTag(PROVIDERS_CACHE_TAG)
  cacheLife({ revalidate: 60, expire: 300 })
  return findProviderRow(createAdminSupabase(), id)
}

// Only fetch the global default when it is actually needed. A template can use an
// inactive row, including on installations where no global fallback key is configured.
export async function templateImageProvider(
  adapters: ProviderAdapters,
  id?: string | null,
  resolution?: Resolution,
  lookup: (id: string) => Promise<ActiveProviderRow> = cachedRow,
  fallback = () => activeProvider('image', adapters),
  readKey = (id: string) => readProviderKey(createAdminSupabase(), id),
) {
  if (!id || !resolution) return fallback()
  const row = await lookup(id)
  if (row.adapter === 'openai_responses') throw new AppError('INVALID_INPUT', 'An image provider is required')
  if (!row.resolutions.includes(resolution)) return fallback()
  return resolveProvider('image', row, serverEnv(), adapters, readKey)
}
