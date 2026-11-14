import { z } from 'zod'

import { logger } from '../logger'
import { liveExperimentSchema, type LiveExperiment } from './types'

// The live experiments as the proxy sees them (ARCHITECTURE §16.5), held per proxy instance. The
// proxy runs apart from the render cache, so an admin change reaches it by expiry: within HOLD_MS.
// Rules so a page is never held up or broken by this read:
// - a held answer is used as it is; once older than HOLD_MS it is still used while one refresh runs
//   behind it (stale-while-revalidate);
// - only an instance with nothing held waits, and at most READ_TIMEOUT_MS;
// - a failed or slow read counts as "no experiments" (everyone sees today's pages) and is held
//   like an answer, so a database outage costs one short wait per instance per HOLD_MS.

export const HOLD_MS = 10_000
export const READ_TIMEOUT_MS = 300

export type LiveRead = (signal: AbortSignal) => Promise<unknown>

const listSchema = z.array(liveExperimentSchema)

function parse(data: unknown): LiveExperiment[] {
  const parsed = listSchema.safeParse(data)
  if (parsed.success) return parsed.data
  logger.warn('experiments.live_config_invalid', { issues: parsed.error.issues.length })
  return []
}

async function readWithin(read: LiveRead, timeoutMs: number): Promise<LiveExperiment[]> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    // Settle first, then cancel the request: the race is already decided by then.
    timer = setTimeout(() => {
      reject(new Error('timeout'))
      controller.abort()
    }, timeoutMs)
  })
  try {
    return parse(await Promise.race([read(controller.signal), timeout]))
  } catch (error) {
    logger.warn('experiments.live_config_read_failed', { error })
    return []
  } finally {
    clearTimeout(timer)
  }
}

export function createLiveConfig(read: LiveRead, now: () => number = Date.now, timeoutMs = READ_TIMEOUT_MS) {
  let held: { value: LiveExperiment[]; at: number } | null = null
  let refreshing: Promise<LiveExperiment[]> | null = null
  const refresh = () =>
    (refreshing ??= readWithin(read, timeoutMs).then((value) => {
      held = { value, at: now() }
      refreshing = null
      return value
    }))
  return async function liveExperiments(): Promise<LiveExperiment[]> {
    if (!held) return refresh()
    if (now() - held.at >= HOLD_MS) void refresh()
    return held.value
  }
}
