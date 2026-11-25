import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import { toHomeHeroSettings, type HeroSceneRow, type HomeHeroSettings } from './home-hero'

// A database without the table yet (before migration 2007): nothing set.
const MISSING = new Set(['42P01', 'PGRST205'])

// Every scope's 首页首屏大图 (migration 2007): at most six rows each, one read. A database without
// the table gives nothing set; any other failure throws, so the caller decides.
export async function readHomeHero(db: SupabaseClient): Promise<HomeHeroSettings> {
  const { data, error } = await db.from('home_hero_scenes').select('scope,position,template_id,caption')
    .order('scope').order('position').limit(200).returns<HeroSceneRow[]>()
  if (error && MISSING.has(error.code)) {
    logger.warn('templates.home_hero_missing', { code: error.code })
    return {}
  }
  if (error) throw new Error(`home hero read: ${error.message}`)
  return toHomeHeroSettings(data ?? [])
}
