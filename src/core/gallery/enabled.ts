import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { SiteConfig } from '../config'
import { AppError } from '../errors'
import { logger } from '../logger'
import { SETTINGS_LIFE } from '../system-settings/read'
import { settingValue } from '../system-settings/registry'
import { decideGallery } from './switch'

// The gallery switch has its own cache tag (the admin save expires it with the settings tag), so
// the marketing pages, whose footer asks it, are not refreshed when another switch changes.
export const GALLERY_SWITCH_TAG = 'gallery-switch'

async function cachedGalleryOpen(): Promise<boolean> {
  'use cache'
  cacheTag(GALLERY_SWITCH_TAG)
  const { data, error } = await createAdminSupabase().from('system_settings').select('value').eq('key', 'gallery_enabled').maybeSingle()
  if (error) {
    // Closed while the read fails, for a minute only, so it heals by itself.
    cacheLife(FAILED_READ_LIFE)
    logger.error('gallery.switch_read_failed', { error: error.message })
    return false
  }
  cacheLife(SETTINGS_LIFE)
  return settingValue({ gallery_enabled: (data as { value?: unknown } | null)?.value }, 'gallery_enabled')
}

// The one place that decides whether the public gallery is open (ARCHITECTURE §9 第 1 条): its
// routes, the footer and every link to it ask here. The site is passed in because core never
// imports site/.
export function isGalleryEnabled(site: SiteConfig): Promise<boolean> {
  return decideGallery(site, async () => ({ gallery_enabled: await cachedGalleryOpen() }))
}

// For API routes and server actions: a closed gallery answers 404 like a missing route.
export async function assertGalleryEnabled(site: SiteConfig): Promise<void> {
  if (!(await isGalleryEnabled(site))) throw new AppError('NOT_FOUND', 'Not found')
}
