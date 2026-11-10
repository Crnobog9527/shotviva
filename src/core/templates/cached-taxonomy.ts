import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import type { Locale } from '../i18n/locales'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { TEMPLATES_CACHE_TAG } from './cache'
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
