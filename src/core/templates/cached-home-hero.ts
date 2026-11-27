import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { TEMPLATES_CACHE_TAG } from './cache'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { heroScenesFor, type HeroSceneEntry } from './home-hero'
import { readHomeHero } from './home-hero-read'

// The home 首屏大图 scenes in this language (its own, else the default ones; migration 2007),
// cached under the templates tag every admin save expires. A failed read gives none (the page
// shows its built-in hero), kept only a minute.
export async function cachedHomeHero(locale: Locale): Promise<HeroSceneEntry[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG)
  try {
    const scenes = heroScenesFor(await readHomeHero(createAdminSupabase()), locale)
    cacheLife(CATALOGUE_LIFE)
    return scenes
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.warn('templates.home_hero_read_failed', { error })
    return []
  }
}
