import { z } from 'zod'

import { logger } from '../logger'
import { liveExperimentSchema, type LiveExperiment } from './types'

// The live experiments as the proxy sees them (ARCHITECTURE §16.5), held per proxy instance. The
// proxy runs apart from the render cache, so an admin change reaches it by expiry: within HOLD_MS.
// Rules so a page is never held up or broken by this read:
// - a held answer is used as it is; once older than HOLD_MS it is still used while one refresh runs
//   behind it (stale-while-revalidate), with REFRESH_TIMEOUT_MS since nobody waits for it;
// - only an instance with nothing held waits, and at most FIRST_WAIT_MS: past that its request
//   gets "no experiments" (today's pages) while the same read goes on and fills the hold for the
//   next requests. The functions run far from the database (hkg1 on the test site), where one
//   read often takes longer than FIRST_WAIT_MS; abandoning it would never fill the hold;
// - a failed refresh keeps the last good answer for up to STALE_LIMIT_MS, then counts as "no
//   experiments" until a read succeeds again.

export const HOLD_MS = 10_000
export const FIRST_WAIT_MS = 300
export const REFRESH_TIMEOUT_MS = 3_000
export const STALE_LIMIT_MS = 5 * 60_000

export type LiveRead = (signal: AbortSignal) => Promise<unknown>

const listSchema = z.array(liveExperimentSchema)

function parse(data: unknown): LiveExperiment[] {
  const parsed = listSchema.safeParse(data)
  if (parsed.success) return parsed.data
  logger.warn('experiments.live_config_invalid', { issues: parsed.error.issues.length })
  throw new Error('invalid live config')
}

// The read, cancelled after timeoutMs; rejects on any failure.
async function readWithin(read: LiveRead, timeoutMs: number): Promise<LiveExperiment[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return parse(await read(controller.signal))
  } finally {
    clearTimeout(timer)
  }
}

const wait = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(resolve, ms, value))

export type LiveConfigTimes = { now?: () => number; firstWaitMs?: number; refreshTimeoutMs?: number }

export function createLiveConfig(read: LiveRead, times: LiveConfigTimes = {}) {
  const now = times.now ?? Date.now
  const firstWait = times.firstWaitMs ?? FIRST_WAIT_MS
  const refreshTimeout = times.refreshTimeoutMs ?? REFRESH_TIMEOUT_MS
  // `at` = when it was last checked (success or failure), `good` = when it last read successfully.
  let held: { value: LiveExperiment[]; at: number; good: number } | null = null
  let refreshing: Promise<LiveExperiment[]> | null = null

  function refresh(): Promise<LiveExperiment[]> {
    refreshing ??= readWithin(read, refreshTimeout)
      .then((value) => {
        held = { value, at: now(), good: now() }
        return value
      })
      .catch((error: unknown) => {
        logger.warn('experiments.live_config_read_failed', { error })
        const kept = held && now() - held.good < STALE_LIMIT_MS ? held.value : []
        held = { value: kept, at: now(), good: held?.good ?? 0 }
        return kept
      })
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  return async function liveExperiments(): Promise<LiveExperiment[]> {
    if (!held) return Promise.race([refresh(), wait<LiveExperiment[]>(firstWait, [])])
    if (now() - held.at >= HOLD_MS) void refresh()
    return held.value
  }
}
