import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { TEMPLATES_CACHE_TAG } from './cache'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { localeBundles } from './locale-display'
import { readFeaturedBundles } from './locale-display-read'

// A 精选组合 as a page in one language shows it: its name there and its templates in order (the
// page drops any that are not live).
export type PublicBundle = { id: string; name: string; memberIds: string[] }

// The bundles the home page shows in this language (migrations 2004, 2005), cached under the
// templates tag every admin save expires, apart from the catalogue (its own reads; a failure
// there never touches the templates). A failed read shows none, kept only a minute.
export async function cachedFeaturedBundles(locale: Locale): Promise<PublicBundle[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG)
  const bundles = await readFeaturedBundles(createAdminSupabase())
  cacheLife(bundles ? CATALOGUE_LIFE : FAILED_READ_LIFE)
  return localeBundles(bundles, locale).map((bundle) => ({
    id: bundle.id, name: locale === 'zh' ? bundle.nameZh : bundle.nameEn, memberIds: bundle.templateIds,
  }))
}
