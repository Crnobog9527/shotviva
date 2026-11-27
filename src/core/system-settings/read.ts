import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { AppError } from '../errors'
import { logger } from '../logger'
import { settle, unwrap, type Settled } from '../shared-read'
import { SYSTEM_SETTINGS, type SystemSettingValues } from './registry'

// The admin save expires this tag (updateTag), so a switch changes without a deploy.
export const SYSTEM_SETTINGS_CACHE_TAG = 'system-settings'

// Every admin save expires the tag, so a good read can live an hour; the lifetime only bounds
// an instance that missed the expiry.
export const SETTINGS_LIFE = { revalidate: 3600, expire: 86_400 } as const

type Db = ReturnType<typeof createAdminSupabase>

const rowsSchema = z.array(z.object({ key: z.string(), value: z.unknown() }))

// Cache only registered runtime switches. Private admin instructions share this table.
export async function loadSystemSettings(db: Db): Promise<SystemSettingValues> {
  const { data, error } = await db.from('system_settings').select('key, value').in('key', Object.keys(SYSTEM_SETTINGS)).order('key')
  if (error) throw new AppError('INTERNAL', 'system_settings read failed', { cause: new Error(error.message) })
  return Object.fromEntries(rowsSchema.parse(data).map((row) => [row.key, row.value]))
}

type Load = () => Promise<SystemSettingValues>

// One copy for the region, not one per server instance: a plain 'use cache' lives in the memory of
// each function instance, and every new instance read the table again (system_settings was the
// test database's most-read table, ~7k reads a day, 2026-11-27). A failed read is kept a minute
// only (../shared-read); settingsOrDefaults below falls back as before. Same tag, so a save still
// expires it at once (updateTag reaches every cache handler).
async function sharedSystemSettings(): Promise<Settled<SystemSettingValues>> {
  'use cache: remote'
  cacheTag(SYSTEM_SETTINGS_CACHE_TAG)
  const result = await settle(() => loadSystemSettings(createAdminSupabase()))
  cacheLife(result.ok ? SETTINGS_LIFE : FAILED_READ_LIFE)
  return result
}
const loadLive: Load = async () => unwrap(await sharedSystemSettings())

// The cached body, apart for tests. A failed read (an outage, a database without the table
// yet) leaves every setting at its default, which closes the wishlist, and that is only kept
// for a minute (FAILED_READ_LIFE, as in #205) so the switch heals by itself.
export async function settingsOrDefaults(load: Load = loadLive): Promise<SystemSettingValues> {
  try {
    const values = await load()
    cacheLife(SETTINGS_LIFE)
    return values
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('system_settings.read_failed', { error })
    return {}
  }
}

export async function cachedSystemSettings(): Promise<SystemSettingValues> {
  'use cache'
  cacheTag(SYSTEM_SETTINGS_CACHE_TAG)
  return settingsOrDefaults()
}
