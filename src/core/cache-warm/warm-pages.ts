import 'server-only'

import { schedule } from '../alerts/schedule'
import { serverEnv } from '../env'
import { logger } from '../logger'
import { appOrigin } from '../site-url'

// Public pages after an admin save (2026-11-21). Admin saves expire their cache tags at once
// (updateTag / revalidateTag with expire 0) so the next load shows the change; every marketing
// page carries those tags (templates, providers, announcements, blog footer, products,
// features), so the next visitor to each page waited for a full render: x-vercel-cache
// REVALIDATED, 1.3-2.1 s on production against 0.1 s on a HIT. Right after the save, the server
// asks for each public page once, one at a time, so that render is paid here instead.
//
// One warm at a time per instance: saves that arrive while one runs ask for one more pass,
// which then sees all of them. Never in development (nothing is cached there).

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const PAUSE_MS = 200

type State = { running: boolean; again: boolean }
const state: State = { running: false, again: false }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function warmOnce(origin: string, paths: readonly string[], fetcher: Fetcher, pause: number): Promise<number> {
  let failed = 0
  for (const path of paths) {
    try {
      const response = await fetcher(`${origin}${path}`, { headers: { accept: 'text/html', 'user-agent': 'ShotvivaCacheWarm/1.0' }, cache: 'no-store', redirect: 'follow' })
      await response.arrayBuffer()
      if (!response.ok) failed++
    } catch {
      failed++
    }
    if (pause) await sleep(pause)
  }
  return failed
}

// Runs passes until no save asked for another one. Exported for tests.
export async function runWarm(origin: string, paths: readonly string[], fetcher: Fetcher = fetch, pause = PAUSE_MS, s: State = state): Promise<void> {
  if (s.running) {
    s.again = true
    return
  }
  s.running = true
  try {
    do {
      s.again = false
      const failed = await warmOnce(origin, paths, fetcher, pause)
      logger.info('cache_warm.done', { pages: paths.length, failed })
    } while (s.again)
  } finally {
    s.running = false
  }
}

export function isWarmableOrigin(origin: string): boolean {
  return origin.startsWith('https://')
}

// Production only. The warm is for visitors' first load after a save; the test site has none, so
// there it was pure extra load: thirteen page renders refilling the expired caches, each with its
// heavy catalogue reads, landing on the small test database in the same seconds as the editor's
// own re-render (refresh()). Those were the minutes the test database stalled and the editor's
// reads hit the statement timeout (PR #963 validation 2026-11-27 12:20Z; earlier stalls followed
// a save or a sync too, e.g. 11-26 15:54 and 11-27 04:14, 06:34).
export function isWarmableEnvironment(env: string | undefined = serverEnv().VERCEL_ENV): boolean {
  return env === 'production'
}

// After the response is sent (after()); never awaited, never throws.
export function warmPagesSoon(paths: readonly string[], origin: string = appOrigin, env?: string): void {
  if (!isWarmableOrigin(origin) || paths.length === 0) return
  if (!isWarmableEnvironment(env ?? serverEnv().VERCEL_ENV)) return
  schedule(() => runWarm(origin, paths))
}
