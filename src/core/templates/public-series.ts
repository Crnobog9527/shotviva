import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { TEMPLATES_CACHE_TAG } from './cache'

// A series (系列, T102) as the public template sections show it: its name and description in
// the page's language, whether admin also lists its members on their own (show_members), and its
// members in the order set on the series page. Only published series are read; which members are
// live (on sale, on the web, in a visible category) is the cached web catalogue's business, so
// the sections keep a member only when the catalogue has it (site/content/home-templates.ts).
export type PublicSeries = {
  id: string
  slug: string
  name: string
  description: string | null
  showMembers: boolean
  memberIds: readonly string[]
}

type SeriesRow = {
  id: string; slug: string; name_en: string; name_zh: string
  description_en: string | null; description_zh: string | null; show_members: boolean
  templates: { id: string }[]
}

// One round trip on the plain tables (a few series; members through templates_series_member_idx
// on (series_id, series_sort_order, id)). Not the web_catalogue_entries view: it runs the sale
// check per template again, which the catalogue read has already done, and it timed out under
// load on the test database (2026-11-12).
const SERIES_COLUMNS = 'id,slug,name_en,name_zh,description_en,description_zh,show_members,templates!templates_series_id_fkey(id)'

export async function readPublicSeries(db: SupabaseClient, locale: Locale): Promise<PublicSeries[]> {
  const { data, error } = await db.from('template_series').select(SERIES_COLUMNS)
    .eq('is_active', true).eq('templates.is_active', true)
    .order('series_sort_order', { referencedTable: 'templates' }).order('id', { referencedTable: 'templates' })
    .returns<SeriesRow[]>()
  if (error) throw error
  return data.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: locale === 'zh' ? s.name_zh : s.name_en,
    description: locale === 'zh' ? s.description_zh : s.description_en,
    showMembers: s.show_members,
    memberIds: s.templates.map((member) => member.id),
  }))
}

type Read = (locale: Locale) => Promise<PublicSeries[]>
const read: Read = (locale) => readPublicSeries(createAdminSupabase(), locale)

// The cached body, apart for tests: a failed read (an outage, a database without the T102
// tables) shows no series for a minute, so members fall back to their own cards and heal.
export async function seriesOrEmpty(locale: Locale, readSeries: Read = read): Promise<PublicSeries[]> {
  try {
    const series = await readSeries(locale)
    cacheLife(CATALOGUE_LIFE)
    return series
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('templates.series_read_failed', { error })
    return []
  }
}

// Under the templates tag every admin save expires (series, members, order, publish state), and
// the providers tag, since a member on sale depends on the current image route.
export async function cachedPublicSeries(locale: Locale): Promise<PublicSeries[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  return seriesOrEmpty(locale)
}
