import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../../auth/supabase-admin'
import { logger } from '@/core/logger'

import { fetchOpenAICosts, OpenAICostsError, type CostsFailure } from './openai-costs'
import { readAdminKey } from './repository'

// OpenAI's billed cost, fetched when /admin/costs is opened and cached for an hour
// (ARCHITECTURE §10.0: no cron). Saving or clearing the key expires the tag. Only the numbers
// are cached; the key is read from Vault inside and never leaves this function. A failure
// throws, so it is not cached and the next view tries again.

export const COSTS_CACHE_TAG = 'openai-costs'

async function cachedBilled(startDay: string, days: number): Promise<Record<string, number> | null> {
  'use cache'
  cacheTag(COSTS_CACHE_TAG)
  cacheLife({ stale: 300, revalidate: 3600, expire: 7200 })
  const { apiKey, projectId } = await readAdminKey(createAdminSupabase())
  if (!apiKey) return null
  return fetchOpenAICosts({ apiKey, projectId, startDay, days })
}

export type Billed = { status: 'ok'; byDay: Record<string, number> } | { status: 'no_key' } | { status: 'error'; failure: CostsFailure; httpStatus: number | null }

// `load` is injectable so tests skip Next's cache.
export async function loadBilled(startDay: string, days: number, load = cachedBilled): Promise<Billed> {
  try {
    const byDay = await load(startDay, days)
    return byDay === null ? { status: 'no_key' } : { status: 'ok', byDay }
  } catch (error) {
    if (error instanceof OpenAICostsError) {
      logger.warn('admin.costs.openai_failed', { failure: error.failure, status: error.status })
      return { status: 'error', failure: error.failure, httpStatus: error.status }
    }
    logger.error('admin.costs.openai_failed', { error })
    return { status: 'error', failure: 'network', httpStatus: null }
  }
}
