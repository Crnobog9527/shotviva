import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { TEMPLATES_CACHE_TAG } from './cache'
import { readCatalogueIndex, type CatalogueIndex } from './catalogue-index'
import type { CatalogueCursor } from './taxonomy'
import { readCategoryEntries, readCategoryTree, readSeriesMembers } from './taxonomy-reads'

export async function cachedCategoryTree() {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  return readCategoryTree(createAdminSupabase())
}

export async function cachedCategoryEntries(path: string[], locale: Locale, cursor?: CatalogueCursor) {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  return readCategoryEntries(createAdminSupabase(), path, locale, cursor)
}

export async function cachedSeriesMembers(id: string, locale: Locale, cursor?: CatalogueCursor) {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  return readSeriesMembers(createAdminSupabase(), id, locale, cursor)
}

type IndexRead = (locale: Locale) => Promise<CatalogueIndex>
const readIndex: IndexRead = (locale) => readCatalogueIndex(createAdminSupabase(), locale)

// The cached body, apart for tests. A failed read (an outage, a deployment restored onto the
// pre-taxonomy schema) is null for a minute only: Create then falls back to its flat list by
// root category instead of an empty page, and heals by itself.
export async function catalogueIndexOrNull(locale: Locale, read: IndexRead = readIndex): Promise<CatalogueIndex | null> {
  try {
    const index = await read(locale)
    cacheLife(CATALOGUE_LIFE)
    return index
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('templates.catalogue_index_failed', { error })
    return null
  }
}

// Create's cards depend on taxonomy and whether the current image route can sell each template.
export async function cachedCatalogueIndex(locale: Locale): Promise<CatalogueIndex | null> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  return catalogueIndexOrNull(locale)
}
