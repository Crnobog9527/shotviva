import 'server-only'

import { createHash } from 'node:crypto'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { FAILED_READ_LIFE } from '@/core/cache-life'
import { serverEnv } from '@/core/env'
import { FEATURES_CACHE_TAG, loadFeatureAccess } from '@/core/features/read'
import type { Locale } from '@/core/i18n/locales'
import { logger } from '@/core/logger'
import { POSTER_FEATURE } from '@/core/poster/sets'
import { PROVIDERS_CACHE_TAG } from '@/core/providers/cache-tag'
import { TEMPLATES_CACHE_TAG } from '@/core/templates/cache'
import { CATALOGUE_LIFE } from '@/core/templates/cached-catalogue'

import { loadCataloguePayload } from './load-catalogue-view'
import { CATALOGUE_SCHEMA, toPublicPayload, type PublicCatalogue } from './public-catalogue'

export type PublicCatalogueFile = { version: string; body: string; posters: boolean }

// Whether the poster templates are for every account: dense_poster has no tier gate (it is not
// invite-only in the registry). Read here, not through the shared remote cache, so a failed read
// stays inside this function's own cache scope.
async function postersForAll(): Promise<boolean> {
  const access = (await loadFeatureAccess(createAdminSupabase())).find((row) => row.key === POSTER_FEATURE)
  return !access?.minTier
}

// The file for one language, built from the shared catalogue cache and kept under the same tags,
// so an admin save, a template sync or an import (all expire TEMPLATES_CACHE_TAG) gives it a new
// version. Never throws: null (kept a minute) when it cannot be built, e.g. a build without the
// database key; the version route answers 404 then and the page shows its own copy or waits.
export async function cachedPublicCatalogue(locale: Locale): Promise<PublicCatalogueFile | null> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG, FEATURES_CACHE_TAG)
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    cacheLife(FAILED_READ_LIFE)
    return null
  }
  try {
    const posters = await postersForAll()
    const payload = toPublicPayload(await loadCataloguePayload(locale, Promise.resolve(posters)), { posters })
    const version = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
    const file: PublicCatalogue = { schema: CATALOGUE_SCHEMA, locale, version, payload }
    cacheLife(CATALOGUE_LIFE)
    return { version, body: JSON.stringify(file), posters }
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('catalogue.public_file_failed', { error })
    return null
  }
}
