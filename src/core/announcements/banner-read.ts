import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { AppError } from '../errors'
import { logger } from '../logger'
import { localize, pickLive } from './rules'
import { bannerRowSchema } from './rules'
import type { AnnouncementRow, BannerAnnouncement, BannerLocale } from './rules'

// The admin page expires this tag on every save and switch (updateTag).
export const ANNOUNCEMENTS_CACHE_TAG = 'announcements'

const BANNER_COLUMNS = 'id, message_en, message_zh, link_url, link_label_en, link_label_zh, tone, starts_at, ends_at'

// Active rows that have not ended yet, soonest first: the live one plus any scheduled after it,
// so the browser can switch on time without waiting for the cache. Partial index
// site_announcements_active_window (where is_active) serves the filter; the set is a handful.
export async function loadBannerCandidates(db: ReturnType<typeof createAdminSupabase>, now: Date): Promise<AnnouncementRow[]> {
  const { data, error } = await db
    .from('site_announcements')
    .select(BANNER_COLUMNS)
    .eq('is_active', true)
    .or(`ends_at.is.null,ends_at.gt."${now.toISOString()}"`)
    .order('starts_at', { ascending: true, nullsFirst: true })
    .limit(5)
  if (error) throw new AppError('INTERNAL', 'site_announcements read failed', { cause: new Error(error.message) })
  return bannerRowSchema.array().parse(data)
}

export type BannerState = { items: BannerAnnouncement[]; initialId: string | null }

// One cache entry per language. initialId is the one live when the entry was filled, so the
// server HTML already carries the banner (no layout shift). Starts and ends inside the cached
// candidates are followed in the browser, and every admin change expires the tag, so the
// entry can live an hour: marketing pages are not regenerated every minute for it.
// A failed read shows no banner rather than breaking every page.
export async function bannerState(locale: BannerLocale): Promise<BannerState> {
  'use cache'
  cacheTag(ANNOUNCEMENTS_CACHE_TAG)
  cacheLife({ revalidate: 3600, expire: 86_400 })
  const now = new Date()
  try {
    const items = (await loadBannerCandidates(createAdminSupabase(), now)).map((row) => localize(row, locale))
    return { items, initialId: pickLive(items, now.getTime())?.id ?? null }
  } catch (error) {
    logger.error('announcements.banner_read_failed', { error })
    return { items: [], initialId: null }
  }
}
