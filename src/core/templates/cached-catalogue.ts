import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { TEMPLATES_CACHE_TAG } from './cache'
import { listTemplatesIn } from './list-templates'
import type { LocalizedTemplate } from './localize'

// The web catalogue for pages every visitor sees (the home generator), cached under the
// templates tag that every admin save expires (ARCHITECTURE §8.3, AGENTS §5.1 item 6). No
// cookies in a cache, so it reads with the service role and keeps the same filters RLS would
// (active, on the web surface); the columns carry no prompts. A failed read (a build without a
// database, an outage) gives an empty list rather than breaking the page.
export async function cachedWebCatalogue(locale: Locale): Promise<LocalizedTemplate[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG)
  cacheLife({ revalidate: 3600, expire: 86_400 })
  try {
    return await listTemplatesIn(createAdminSupabase(), locale)
  } catch (error) {
    logger.error('templates.catalogue_read_failed', { error })
    return []
  }
}
