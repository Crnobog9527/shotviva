import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { logger } from '../logger'
import { SETTINGS_LIFE } from './read'
import { settingValue } from './registry'

// Its own tag (the admin save expires it with the settings tag), like the gallery switch: the
// root layout reads it, so other switches do not refresh every page.
export const FOOD_TOGGLES_SWITCH_TAG = 'food-toggles-switch'

type Read = () => Promise<unknown>

async function readLive(): Promise<unknown> {
  const { data, error } = await createAdminSupabase().from('system_settings').select('value').eq('key', 'food_toggles_enabled').maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { value?: unknown } | null)?.value
}

// The cached body, apart for tests. A failed read keeps the options off (the safe side), for a
// minute only, so it heals by itself.
export async function foodTogglesOrOff(read: Read = readLive): Promise<boolean> {
  try {
    const on = settingValue({ food_toggles_enabled: await read() }, 'food_toggles_enabled')
    cacheLife(SETTINGS_LIFE)
    return on
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('food_toggles.switch_read_failed', { error })
    return false
  }
}

// Whether food templates offer 优化摆盘 / 优化器皿 at all (system_settings food_toggles_enabled,
// default off). The UI hides them and runGeneration renders them off while it is false.
export async function foodTogglesEnabled(): Promise<boolean> {
  'use cache'
  cacheTag(FOOD_TOGGLES_SWITCH_TAG)
  return foodTogglesOrOff()
}
