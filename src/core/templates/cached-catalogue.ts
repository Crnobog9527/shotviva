import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { TEMPLATES_CACHE_TAG } from './cache'
import { listTemplatesIn } from './list-templates'
import type { LocalizedTemplate } from './localize'

export const CATALOGUE_LIFE = { revalidate: 3600, expire: 86_400 } as const

type Read = (locale: Locale) => Promise<LocalizedTemplate[]>
// Every live web template, series members included (T102): these pages look templates up by id
// (featured picks, ?open=, the home picker's saved templates) and price the catalogue (credit
// facts, the paywall's photo estimate); a member is as live and as priced as any other template.
export const readCatalogue: Read = (locale) => listTemplatesIn(createAdminSupabase(), locale, { includeSeriesMembers: true })

// The cached body, apart for tests: the live list with the normal lifetime, or, when the read
// fails (a build without a database, an outage, a column the database does not have yet), an
// empty list that is only kept for a minute (FAILED_READ_LIFE), so the page heals by itself.
export async function catalogueOrEmpty(locale: Locale, read: Read = readCatalogue): Promise<LocalizedTemplate[]> {
  try {
    const templates = await read(locale)
    cacheLife(CATALOGUE_LIFE)
    return templates
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('templates.catalogue_read_failed', { error })
    return []
  }
}

// The web catalogue for pages every visitor sees (the home generator, the featured template
// sections on home and landing pages, the 404 picks), cached under the templates tag that
// every admin save expires (ARCHITECTURE §8.3, AGENTS §5.1 item 6). No cookies in a cache, so
// it reads with the service role and keeps the same filters RLS would (active, on the web
// surface); the columns carry no prompts.
export async function cachedWebCatalogue(locale: Locale): Promise<LocalizedTemplate[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  return catalogueOrEmpty(locale)
}

// The same live web templates for the signed-in app pages (Create's grid, a template's
// workspace, the batch matrix, Photos), which used to read them on every request with the
// visitor's session. The rows are public catalogue data and nothing in them depends on who
// is asking: web_templates() applies the publication and sale rules for every role, and the
// columns carry no prompts. Charges never read this cache; reserve_credits re-checks the
// template and route itself. Unlike cachedWebCatalogue a failed read throws, so it is never
// cached and the page shows its error state instead of an empty catalogue.
export async function cachedWebTemplates(locale: Locale, includeSeriesMembers: boolean): Promise<LocalizedTemplate[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  return listTemplatesIn(createAdminSupabase(), locale, { includeSeriesMembers })
}
