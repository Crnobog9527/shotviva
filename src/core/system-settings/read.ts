import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { AppError } from '../errors'
import { logger } from '../logger'
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
const loadLive: Load = () => loadSystemSettings(createAdminSupabase())

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
