import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { createAdminSupabase } from '../../auth/supabase-admin'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'

import { fetchOpenAICosts, OpenAICostsError, type CostsFailure } from './openai-costs'
import { fetchOpenRouterActivity } from './openrouter-activity'
import { readAdminKey } from './repository'

// Each provider's billed cost, fetched when /admin/costs is opened and cached for an hour
// (ARCHITECTURE §10.0: no cron). Saving or clearing the OpenAI key expires the tag. Only the
// numbers are cached; keys are read inside and never leave these functions.
//
// The cached functions return a plain result and never throw: an error crossing a 'use cache'
// boundary loses its class, which is how a 429 from OpenAI used to read 连不上 OpenAI. A failure is
// cached for a minute only, so a refresh soon tries again without hammering a rate limit.

export const COSTS_CACHE_TAG = 'openai-costs'

export type Billed =
  | { status: 'ok'; byDay: Record<string, number> }
  | { status: 'no_key' }
  // No billing API is wired for this provider (Ark): only our side is shown.
  | { status: 'not_connected' }
  | { status: 'error'; failure: CostsFailure; httpStatus: number | null; code: string | null }

const FAILURE_LIFE = { stale: 30, revalidate: 60, expire: 120 }
const OK_LIFE = { stale: 300, revalidate: 3600, expire: 7200 }

async function settle(provider: string, read: () => Promise<Record<string, number> | null>): Promise<Billed> {
  try {
    const byDay = await read()
    return byDay === null ? { status: 'no_key' } : { status: 'ok', byDay }
  } catch (error) {
    if (error instanceof OpenAICostsError) {
      logger.warn('admin.costs.bill_failed', { provider, failure: error.failure, status: error.status, code: error.code })
      return { status: 'error', failure: error.failure, httpStatus: error.status, code: error.code }
    }
    logger.error('admin.costs.bill_failed', { provider, error })
    return { status: 'error', failure: 'network', httpStatus: null, code: null }
  }
}

async function cachedOpenAI(startDay: string, days: number): Promise<Billed> {
  'use cache'
  cacheTag(COSTS_CACHE_TAG)
  const result = await settle('openai', async () => {
    const { apiKey, projectId } = await readAdminKey(createAdminSupabase())
    return apiKey ? fetchOpenAICosts({ apiKey, projectId, startDay, days }) : null
  })
  cacheLife(result.status === 'error' ? FAILURE_LIFE : OK_LIFE)
  return result
}

// The window's first day is in the key only so the entry turns over once a day.
async function cachedOpenRouter(startDay: string): Promise<Billed> {
  'use cache'
  void startDay
  cacheTag(COSTS_CACHE_TAG)
  const result = await settle('openrouter', async () => {
    const apiKey = serverEnv().OPENROUTER_MANAGEMENT_KEY
    return apiKey ? fetchOpenRouterActivity(apiKey) : null
  })
  cacheLife(result.status === 'error' ? FAILURE_LIFE : OK_LIFE)
  return result
}

export type ProviderBills = { openai: Billed; openrouter: Billed; ark: Billed }

// `load` is injectable so tests skip Next's cache.
export async function loadBills(startDay: string, days: number, load = { openai: cachedOpenAI, openrouter: cachedOpenRouter }): Promise<ProviderBills> {
  const [openai, openrouter] = await Promise.all([load.openai(startDay, days), load.openrouter(startDay)])
  return { openai, openrouter, ark: { status: 'not_connected' } }
}

export { settle as settleBill }
