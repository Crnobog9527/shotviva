import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { TEMPLATES_CACHE_TAG } from './cache'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { publicCaseEntries, type PublicCaseEntry } from './home-case-strip'
import { readHomeCaseStrip } from './home-case-strip-read'
import { readFeaturedBundles } from './locale-display-read'

// The home 「更多真实案例」 entries in this language (migration 2006), cached under the templates tag
// every admin save expires, apart from the catalogue. A failed read gives none (the page shows
// its built-in row), kept only a minute.
export async function cachedCaseStrip(locale: Locale): Promise<PublicCaseEntry[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG)
  try {
    const db = createAdminSupabase()
    const entries = (await readHomeCaseStrip(db))[locale] ?? []
    const needsBundles = entries.some((entry) => entry.kind === 'bundle')
    const bundles = needsBundles ? await readFeaturedBundles(db) : undefined
    // readFeaturedBundles logs and gives undefined on a failure; here that must not be cached for
    // an hour with the bundle entries silently gone, so it takes the short failed-read life below.
    if (needsBundles && !bundles) throw new Error('featured bundles unreadable')
    cacheLife(CATALOGUE_LIFE)
    return publicCaseEntries(entries, bundles, locale)
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.warn('templates.case_strip_read_failed', { error })
    return []
  }
}
