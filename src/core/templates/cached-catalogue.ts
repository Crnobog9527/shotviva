import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { settle, unwrap, type Settled } from '../shared-read'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { TEMPLATES_CACHE_TAG } from './cache'
import { listTemplates, listTemplatesIn, webTemplatesIn } from './list-templates'
import { applyLocaleDisplay, type LocaleDisplay } from './locale-display'
import { readLocaleDisplay } from './locale-display-read'
import type { LocalizedTemplate } from './localize'
import type { Template } from './types'

export const CATALOGUE_LIFE = { revalidate: 3600, expire: 86_400 } as const

// The live web rows, series members and poster templates included, read once for every server
// instance and both languages. web_templates() checks each template's sale floor and takes
// 0.4-0.75 s on average, up to 6-8 s, on production (pg_stat_statements, 2026-11-23); under a plain
// 'use cache' every new instance read it again for each language and each list below (up to six
// reads), and concurrent reads ran into the statement timeout (listTemplates, 2026-11-23 and
// 2026-11-11). 'use cache: remote' keeps one copy for the region (Next allows a remote cache inside
// a regular one, so the callers stay prerenderable). A failed read is kept a minute only, as the
// callers already keep their empty fallback, and reaches them as an error (../shared-read: an error
// thrown inside the remote cache would fail the prerender of every page that reads it).
async function settledWebTemplates(): Promise<Settled<Template[]>> {
  'use cache: remote'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  const result = await settle(() => listTemplates(createAdminSupabase(), 'web', { includeSeriesMembers: true }))
  cacheLife(result.ok ? CATALOGUE_LIFE : FAILED_READ_LIFE)
  return result
}
const sharedWebTemplates = async (): Promise<Template[]> => unwrap(await settledWebTemplates())

// Each language's category order and featured list (migration 1575), one copy for the region: the
// catalogue, Create's index and the home page all ask for it, and under a plain 'use cache' each new
// server instance read both tables again for every caller (~2k reads a day each on the test
// database, 2026-11-27). A failed read is kept a minute only; the caller gets it as an error.
async function settledLocaleDisplay(): Promise<Settled<LocaleDisplay>> {
  'use cache: remote'
  cacheTag(TEMPLATES_CACHE_TAG)
  const result = await settle(() => readLocaleDisplay(createAdminSupabase()))
  cacheLife(result.ok ? CATALOGUE_LIFE : FAILED_READ_LIFE)
  return result
}
export const sharedLocaleDisplay = async (): Promise<LocaleDisplay> => unwrap(await settledLocaleDisplay())

type Read = (locale: Locale) => Promise<LocalizedTemplate[]>
// Every live web template, series members included (T102): these pages look templates up by id
// (featured picks, ?open=, the home picker's saved templates) and price the catalogue (credit
// facts, the paywall's photo estimate); a member is as live and as priced as any other template.
export const readCatalogue: Read = async (locale) => {
  const [rows, display] = await Promise.all([sharedWebTemplates(), sharedLocaleDisplay()])
  const live = webTemplatesIn(rows, locale)
  // This language's category order and featured list (migration 1575); the shared ones until set.
  return applyLocaleDisplay(live, display, locale)
}

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
  if (!includeSeriesMembers) return listTemplatesIn(createAdminSupabase(), locale, { includeSeriesMembers })
  return webTemplatesIn(await sharedWebTemplates(), locale)
}

// The dense-text poster templates (ARCHITECTURE §5.3), which the catalogue above leaves out:
// Photos names and covers poster works with them. Never offered for Make again.
export async function cachedPosterTemplates(locale: Locale): Promise<LocalizedTemplate[]> {
  'use cache'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  cacheLife(CATALOGUE_LIFE)
  return webTemplatesIn(await sharedWebTemplates(), locale, { posters: true })
}

type TemplateReads = {
  cached: (locale: Locale) => Promise<LocalizedTemplate[]>
  live: (db: SupabaseClient, locale: Locale, id: string) => Promise<LocalizedTemplate[]>
}
const READS: TemplateReads = {
  cached: (locale) => cachedWebTemplates(locale, true),
  live: (db, locale, id) => listTemplatesIn(db, locale, { id }),
}

// One template's workspace: the cached catalogue first. A miss reads that template live once
// (web_templates(p_template_id) on the visitor's session), so a template put on sale after the
// cache was filled opens at once instead of 404ing until the cache refreshes. null: not live.
export async function findWebTemplate(db: SupabaseClient, locale: Locale, id: string, reads: TemplateReads = READS) {
  const hit = (await reads.cached(locale)).find((template) => template.id === id)
  if (hit) return hit
  const [live] = await reads.live(db, locale, id)
  return live ?? null
}
