import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { logger } from '../logger'
import { FOOD_SWITCHES_OFF, type FoodSwitches } from '../templates/food-toggle-keys'
import { SETTINGS_LIFE } from './read'
import { settingValue } from './registry'

// Its own tag (the admin save expires it with the settings tag), like the gallery switch: the
// root layout reads it, so other switches do not refresh every page.
export const FOOD_TOGGLES_SWITCH_TAG = 'food-toggles-switch'

export const FOOD_SWITCH_KEYS = ['food_plating_enabled', 'food_tableware_enabled'] as const
export type FoodSwitchKey = (typeof FOOD_SWITCH_KEYS)[number]

type Read = () => Promise<Partial<Record<string, unknown>>>

async function readLive(): Promise<Partial<Record<string, unknown>>> {
  const { data, error } = await createAdminSupabase().from('system_settings').select('key, value').in('key', [...FOOD_SWITCH_KEYS])
  if (error) throw new Error(error.message)
  return Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((row) => [row.key, row.value]))
}

// The cached body, apart for tests. A failed read keeps both options off (the safe side), for a
// minute only, so it heals by itself.
export async function foodSwitchesOrOff(read: Read = readLive): Promise<FoodSwitches> {
  try {
    const values = await read()
    const switches = { plating: settingValue(values, 'food_plating_enabled'), tableware: settingValue(values, 'food_tableware_enabled') }
    cacheLife(SETTINGS_LIFE)
    return switches
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('food_toggles.switch_read_failed', { error })
    return FOOD_SWITCHES_OFF
  }
}

// Whether food templates offer 优化摆盘 and 优化器皿 (system_settings food_plating_enabled,
// food_tableware_enabled, 2009; each off by default). The UI hides a toggle and runGeneration
// renders it off while its switch is off.
export async function foodSwitches(): Promise<FoodSwitches> {
  'use cache'
  cacheTag(FOOD_TOGGLES_SWITCH_TAG)
  return foodSwitchesOrOff()
}
