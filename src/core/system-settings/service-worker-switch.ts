import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { logger } from '../logger'
import { SETTINGS_LIFE } from './read'
import { settingValue } from './registry'

// Its own tag (the admin save expires it with the settings tag), like the food toggles: the root
// layout and /sw.js read it, so other switches do not refresh every page.
export const SERVICE_WORKER_SWITCH_TAG = 'service-worker-switch'

type Read = () => Promise<unknown>

type Key = 'service_worker_enabled' | 'service_worker_shell_enabled'

const readLive = (key: Key) => async (): Promise<unknown> => {
  const { data, error } = await createAdminSupabase().from('system_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { value?: unknown } | null)?.value
}

// The cached body, apart for tests. A failed read keeps the worker (or the shell) off, the safe
// side: /sw.js unregisters itself, or answers no page from a cache. For a minute only, so it heals.
export async function serviceWorkerOrOff(read: Read = readLive('service_worker_enabled'), key: Key = 'service_worker_enabled'): Promise<boolean> {
  try {
    const on = settingValue({ [key]: await read() }, key)
    cacheLife(SETTINGS_LIFE)
    return on
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('service_worker.switch_read_failed', { key, error })
    return false
  }
}

// Whether the home-screen app's service worker is on (system_settings service_worker_enabled,
// default off). The admin switch is also its kill switch: off, /sw.js unregisters itself.
export async function serviceWorkerEnabled(): Promise<boolean> {
  'use cache'
  cacheTag(SERVICE_WORKER_SWITCH_TAG)
  return serviceWorkerOrOff()
}

// Whether the worker answers Create with its app shell (ARCHITECTURE §18.3; system_settings
// service_worker_shell_enabled, default off). Only while the master switch is on as well.
export async function serviceWorkerShellEnabled(): Promise<boolean> {
  'use cache'
  cacheTag(SERVICE_WORKER_SWITCH_TAG)
  return serviceWorkerOrOff(readLive('service_worker_shell_enabled'), 'service_worker_shell_enabled')
}
