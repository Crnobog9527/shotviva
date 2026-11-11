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
// live members in the order set on the series page. Only series Create shows: active, in a
// visible category, with at least one member on sale (web_catalogue_entries).
export type PublicSeries = {
  id: string
  slug: string
  name: string
  description: string | null
  showMembers: boolean
  memberIds: readonly string[]
}

type SeriesRow = {
  series_id: string
  entry_series: { id: string; slug: string; name_en: string; name_zh: string; description_en: string | null; description_zh: string | null; show_members: boolean }
}
type MemberRow = { id: string; series_id: string }

const SERIES_COLUMNS = 'series_id,entry_series(id,slug,name_en,name_zh,description_en,description_zh,show_members)'

// Two small reads in parallel: the visible series (a view over template_series, a few rows) and
// every live member's series and place (web_template_members, ordered as the series page
// orders them: series_sort_order, then id).
export async function readPublicSeries(db: SupabaseClient, locale: Locale): Promise<PublicSeries[]> {
  const [series, members] = await Promise.all([
    db.from('web_catalogue_entries').select(SERIES_COLUMNS).eq('type', 'series').returns<SeriesRow[]>(),
    db.from('web_template_members').select('id,series_id').not('series_id', 'is', null)
      .order('series_sort_order').order('id').returns<MemberRow[]>(),
  ])
  if (series.error) throw series.error
  if (members.error) throw members.error
  return series.data.map(({ entry_series: s }) => ({
    id: s.id,
    slug: s.slug,
    name: locale === 'zh' ? s.name_zh : s.name_en,
    description: locale === 'zh' ? s.description_zh : s.description_en,
    showMembers: s.show_members,
    memberIds: members.data.filter((member) => member.series_id === s.id).map((member) => member.id),
  }))
}

type Read = (locale: Locale) => Promise<PublicSeries[]>
const read: Read = (locale) => readPublicSeries(createAdminSupabase(), locale)

// The cached body, apart for tests: a failed read (an outage, a database without the T102
// views) shows no series for a minute, so members fall back to their own cards and heal.
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
